import { mkdtemp, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearFailedLogins, createSessionToken, lockoutRemaining, readCookie, recordFailedLogin, verifySessionToken } from "../src/lib/auth-session";
import { emitEvent, eventCounters, recentEvents, seedEvents } from "../src/lib/events";
import { countInlineMedia, offloadInlineMedia, readMedia, storeDataUrl } from "../src/lib/media-store";
import { jsonBackend, sqliteBackend } from "../src/lib/store-backend";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { normalizeStore } from "../src/lib/normalize";
import { runCustomerTouches } from "../src/lib/customer-touches";
import type { AppData } from "../src/lib/types";

const PNG_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "bhc-platform-"));
});
afterEach(async () => {
  delete process.env.MEDIA_DIR;
  delete process.env.REVIEW_URL;
  await rm(tmp, { recursive: true, force: true });
});

describe("session cookies", () => {
  it("round-trips a signed token and rejects tampering / expiry", async () => {
    const { token, expiresAt } = await createSessionToken("emp-admin");
    expect(expiresAt).toBeGreaterThan(Date.now());
    const ok = await verifySessionToken(token);
    expect(ok?.employeeId).toBe("emp-admin");
    expect(await verifySessionToken(token.replace("emp-admin", "emp-sales"))).toBeNull();
    expect(await verifySessionToken(token.slice(0, -2) + "zz")).toBeNull();
    expect(await verifySessionToken(token, expiresAt + 1)).toBeNull();
    expect(await verifySessionToken(null)).toBeNull();
    expect(readCookie(`a=1; bhc_session=${token}; b=2`, "bhc_session")).toBe(token);
  });

  it("locks out after repeated failures and clears on success", () => {
    const key = "login:test-user";
    clearFailedLogins(key);
    for (let i = 0; i < 4; i++) expect(recordFailedLogin(key).locked).toBe(false);
    expect(lockoutRemaining(key)).toBe(0);
    expect(recordFailedLogin(key).locked).toBe(true);
    expect(lockoutRemaining(key)).toBeGreaterThan(0);
    clearFailedLogins(key);
    expect(lockoutRemaining(key)).toBe(0);
  });
});

describe("live events", () => {
  it("buffers, cursors and counts", () => {
    seedEvents([]);
    const a = emitEvent({ kind: "lead", level: "success", title: "A" });
    emitEvent({ kind: "outreach", level: "out", title: "B" });
    emitEvent({ kind: "outreach", level: "out", title: "C" });
    expect(recentEvents({ limit: 2 }).map((e) => e.title)).toEqual(["B", "C"]);
    expect(recentEvents({ afterId: a.id }).map((e) => e.title)).toEqual(["B", "C"]);
    expect(eventCounters().outreach).toBe(2);
  });
});

describe("media offload", () => {
  it("writes data URLs to disk, serves them back, and migrates the store idempotently", async () => {
    process.env.MEDIA_DIR = tmp;
    const url = await storeDataUrl(PNG_1x1, "test");
    expect(url).toMatch(/^\/api\/media\/test-[0-9a-f-]+\.png$/);
    const file = url.split("/").pop()!;
    const media = await readMedia(file);
    expect(media?.mime).toBe("image/png");
    expect(media?.buffer.length).toBeGreaterThan(50);
    expect(await readMedia("../etc/passwd")).toBeNull();
    expect(await storeDataUrl("/api/media/already.png")).toBe("/api/media/already.png");

    const data = normalizeStore(buildDemoSeedData());
    data.jobProgress = [{ id: "p1", jobId: data.jobs[0].id, authorId: "emp-admin", notes: "n", imageDataUrls: [PNG_1x1, PNG_1x1], aiSummary: null, createdAt: new Date().toISOString() }];
    data.damageReports = [];
    data.knockProposals = [];
    expect(countInlineMedia(data)).toBe(2);
    const r1 = await offloadInlineMedia(data, 1);
    expect(r1).toEqual({ moved: 1, remaining: 1 });
    const r2 = await offloadInlineMedia(data);
    expect(r2).toEqual({ moved: 1, remaining: 0 });
    expect(countInlineMedia(data)).toBe(0);
    expect(data.jobProgress[0].imageDataUrls.every((u) => u.startsWith("/api/media/"))).toBe(true);
    expect(await offloadInlineMedia(data)).toEqual({ moved: 0, remaining: 0 });
  });
});

describe("store backends", () => {
  it("json backend round-trips atomically", async () => {
    const b = jsonBackend(path.join(tmp, "store.json"));
    expect(await b.exists()).toBe(false);
    const data = normalizeStore(buildDemoSeedData());
    await b.writeAll(data);
    expect(await b.exists()).toBe(true);
    const back = await b.readAll();
    expect(back?.leads?.length).toBe(data.leads.length);
    expect(JSON.parse(await readFile(path.join(tmp, "store.json"), "utf8")).employees.length).toBe(data.employees.length);
  });

  it("sqlite backend stores one row per collection and only rewrites changed ones", async () => {
    const b = await sqliteBackend(path.join(tmp, "store.sqlite"));
    if (!b) return; // node:sqlite unavailable on this Node — covered on CI (Node 22)
    const data = normalizeStore(buildDemoSeedData());
    expect(await b.exists()).toBe(false);
    await b.writeAll(data);
    expect(await b.exists()).toBe(true);
    const back = (await b.readAll()) as AppData;
    expect(back.leads.length).toBe(data.leads.length);
    expect(back.adListings).toEqual([]);
    // mutate one collection and write again — should not throw and should persist
    back.leads[0].name = "Changed Name";
    await b.writeAll(back);
    const again = (await b.readAll()) as AppData;
    expect(again.leads[0].name).toBe("Changed Name");
    b.close?.();
  });
});

describe("customer touches", () => {
  function base(): AppData {
    const d = normalizeStore(buildDemoSeedData());
    d.outreachQueue = [];
    d.optOuts = [];
    const lead = d.leads[0];
    lead.email = "cust@example.com";
    lead.phone = "902-555-0111";
    const job = d.jobs[0];
    job.leadId = lead.id;
    job.status = "completed";
    job.createdAt = new Date(Date.now() - 40 * 86_400_000).toISOString();
    d.invoices = [
      { id: "inv-1", jobId: job.id, kind: "invoice", status: "paid", customerName: lead.name, lines: [{ id: "l", description: "x", quantity: 1, unitPrice: 5000 }], includeProgress: false, progressEntryIds: [], notes: "", aiSummary: null, createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString(), createdById: "emp-admin", paidAt: new Date(Date.now() - 15 * 86_400_000).toISOString() },
      { id: "inv-2", jobId: job.id, kind: "invoice", status: "sent", customerName: lead.name, lines: [{ id: "l", description: "y", quantity: 1, unitPrice: 1200 }], includeProgress: false, progressEntryIds: [], notes: "", aiSummary: null, createdAt: new Date(Date.now() - 16 * 86_400_000).toISOString(), createdById: "emp-admin", sentAt: new Date(Date.now() - 16 * 86_400_000).toISOString(), token: "tok" },
    ];
    return d;
  }
  const ctx = { newId: () => `t-${Math.random().toString(16).slice(2)}`, nowIso: () => new Date().toISOString() };

  it("review requests need REVIEW_URL and run once per job", () => {
    const d = base();
    expect(runCustomerTouches(d, "review_requests", ctx).created).toBe(0);
    process.env.REVIEW_URL = "https://g.page/r/xyz/review";
    expect(runCustomerTouches(d, "review_requests", ctx).created).toBe(1);
    const item = d.outreachQueue[0];
    expect(item.kind).toBe("review");
    expect(item.channel).toBe("sms");
    expect(item.message).toContain("g.page/r/xyz");
    expect(item.status).toBe("pending_approval");
    expect(runCustomerTouches(d, "review_requests", ctx).created).toBe(0);
  });

  it("referral asks mint a code once and payment reminders escalate 7/14/30", () => {
    const d = base();
    expect(runCustomerTouches(d, "referral_asks", ctx).created).toBe(1);
    expect(d.leads[0].referralCode).toMatch(/^[A-Z]{1,4}-[A-Z0-9]{4}$/);
    expect(d.outreachQueue[0].message).toContain(`/r/${d.leads[0].referralCode}`);
    expect(runCustomerTouches(d, "referral_asks", ctx).created).toBe(0);

    const r = runCustomerTouches(d, "payment_reminders", ctx);
    expect(r.created).toBe(1);
    const inv = d.invoices.find((i) => i.id === "inv-2")!;
    expect(inv.remindersSent).toBe(1);
    expect(d.outreachQueue[0].kind).toBe("payment_reminder");
    expect(d.outreachQueue[0].message).toContain("/pay/tok");
    // 16 days old → 2 reminders due (7, 14); second run creates the 14-day one, third does nothing
    expect(runCustomerTouches(d, "payment_reminders", ctx).created).toBe(1);
    expect(inv.remindersSent).toBe(2);
    expect(runCustomerTouches(d, "payment_reminders", ctx).created).toBe(0);
  });
});
