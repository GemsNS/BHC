import { describe, expect, it } from "vitest";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { normalizeStore } from "../src/lib/normalize";
import { handleInboundReply, isOptedOut, processOutreachQueue, recordOptOut, type SendPolicy } from "../src/lib/outreach-send";
import { WEBHOOK_PRESETS, buildWebhookBody, describeWebhookEvent, endpointFromPreset } from "../src/lib/webhooks";
import type { AppData, OutreachQueueItem } from "../src/lib/types";

let n = 0;
const ctx = { newId: () => `in-${++n}`, nowIso: () => new Date().toISOString() };
const policy: SendPolicy = { autosend: new Set(), autosendMinScore: 75, dailyCap: 25, quietStart: 0, quietEnd: 0, followUpDays: 3, maxFollowUps: 1 };

function withSent(): { d: AppData; item: OutreachQueueItem } {
  const d = normalizeStore(buildDemoSeedData());
  d.outreachQueue = [];
  d.optOuts = [];
  d.adListings = [
    {
      id: "ad-1",
      sourceId: "s",
      sourceName: "Kijiji",
      externalId: "k1",
      url: "",
      title: "Need siding",
      body: "",
      location: "Dartmouth",
      postedAt: null,
      fetchedAt: ctx.nowIso(),
      contactName: "Jane",
      contactEmail: "jane@example.com",
      contactPhone: "902-555-0142",
      status: "sent",
      score: 80,
      category: "siding",
      jobType: "residential",
      summary: "",
      reasons: [],
      classifiedBy: "local",
      leadId: d.leads[0].id,
      outreachIds: ["o-sms", "o-email"],
      repliedAt: null,
      notes: "",
    },
  ];
  d.leads[0].phone = "(902) 555-0142";
  d.leads[0].email = "jane@example.com";
  d.leads[0].status = "new";
  const base = { leadId: d.leads[0].id, prospectName: "Jane", prospectEmail: "jane@example.com", prospectPhone: "902-555-0142", subject: "Re: siding", message: "hi", status: "sent" as const, workflowRunId: null, scheduledAt: ctx.nowIso(), sentAt: ctx.nowIso(), createdAt: ctx.nowIso(), adId: "ad-1" };
  const sms: OutreachQueueItem = { ...base, id: "o-sms", channel: "sms" };
  const email: OutreachQueueItem = { ...base, id: "o-email", channel: "email" };
  d.outreachQueue.push(sms, email);
  return { d, item: sms };
}

describe("inbound replies", () => {
  it("STOP by SMS records an opt-out, cancels queued items, and marks the ad lost", async () => {
    const { d } = withSent();
    d.outreachQueue.push({ ...d.outreachQueue[0], id: "o-followup", status: "pending_approval", followUpOf: "o-sms" });
    const out = handleInboundReply(d, { channel: "sms", from: "+19025550142", body: "STOP" }, ctx);
    expect(out.optedOut).toBe(true);
    expect(isOptedOut(d, "sms", "902-555-0142")).toBe(true);
    expect(d.outreachQueue.find((o) => o.id === "o-followup")!.status).toBe("cancelled");
    expect(d.adListings[0].status).toBe("lost");
    expect(d.leads[0].status).toBe("lost");
    expect(d.webhookDeliveries.length).toBe(0); // no endpoints subscribed → nothing queued
  });

  it("a real reply marks the ad replied, moves the lead, logs activity + task, and notifies", () => {
    const { d } = withSent();
    const before = d.notifications.length;
    const out = handleInboundReply(d, { channel: "sms", from: "9025550142", body: "Sure, Thursday afternoon works" }, ctx);
    expect(out.matched).toBe(true);
    expect(out.optedOut).toBe(false);
    expect(out.adId).toBe("ad-1");
    expect(d.adListings[0].status).toBe("replied");
    expect(d.outreachQueue.find((o) => o.id === "o-sms")!.repliedAt).toBeTruthy();
    expect(d.leads[0].status).toBe("contacted");
    expect(d.activities[0].type).toBe("task");
    expect(d.activities[0].subject).toContain("Reply to");
    expect(d.notifications.length).toBe(before + 1);
    expect(d.notifications[0].title).toContain("replied by sms");
  });

  it("email 'no thanks' opts out; unknown senders are ignored", () => {
    const { d } = withSent();
    const out = handleInboundReply(d, { channel: "email", from: "Jane <JANE@example.com>", body: "No thanks, we already found someone.", subject: "Re: siding" }, ctx);
    expect(out.optedOut).toBe(true);
    expect(isOptedOut(d, "email", "jane@example.com")).toBe(true);
    const unknown = handleInboundReply(d, { channel: "email", from: "stranger@example.org", body: "hello" }, ctx);
    expect(unknown.matched).toBe(false);
  });

  it("opted-out recipients are never sent to", async () => {
    const { d } = withSent();
    recordOptOut(d, { channel: "email", address: "jane@example.com", reason: "manual", source: "manual" }, ctx);
    d.outreachQueue.push({ ...d.outreachQueue[1], id: "o-new", status: "approved", sentAt: null });
    let calls = 0;
    const r = await processOutreachQueue(d, ctx, { email: async () => { calls += 1; return { ok: true }; } }, policy);
    expect(calls).toBe(0);
    expect(r.skipped).toBe(1);
    expect(d.outreachQueue.find((o) => o.id === "o-new")!.status).toBe("cancelled");
  });
});

describe("webhook formats + presets", () => {
  it("formats Slack and Discord bodies as chat messages and JSON as signed envelope", () => {
    const payload = { adId: "a1", leadId: "l1", score: 82, category: "siding", drafts: ["email", "sms"] };
    const slack = JSON.parse(buildWebhookBody("slack", "ad.qualified", payload, "2026-09-01T00:00:00Z"));
    expect(slack.text).toContain("Job ad qualified");
    expect(slack.text).toContain("score: 82");
    const discord = JSON.parse(buildWebhookBody("discord", "ad.qualified", payload, "2026-09-01T00:00:00Z"));
    expect(discord.content).toContain("BHC");
    const json = JSON.parse(buildWebhookBody("json", "ad.qualified", payload, "2026-09-01T00:00:00Z"));
    expect(json.event).toBe("ad.qualified");
    expect(json.data.adId).toBe("a1");
    expect(json.text).toBeTruthy();
    const tick = describeWebhookEvent("automation.tick", { counters: { automationsRun: 3, notificationsCreated: 1, tasksCreated: 0, webhooksSent: 2, webhooksFailed: 0 }, errors: ["boom"] });
    expect(tick).toContain("3 automation(s)");
    expect(tick).toContain("ERRORS: boom");
  });

  it("presets produce enabled endpoints with events, format and a fresh secret", () => {
    const preset = WEBHOOK_PRESETS.find((p) => p.id === "ops-alerts-slack")!;
    const ep = endpointFromPreset(preset, "https://hooks.slack.com/services/T/B/x", ctx.newId, ctx.nowIso);
    expect(ep.format).toBe("slack");
    expect(ep.events).toContain("ad.qualified");
    expect(ep.events).toContain("outreach.replied");
    expect(ep.secret.length).toBeGreaterThan(10);
    expect(ep.enabled).toBe(true);
    expect(ep.preset).toBe("ops-alerts-slack");
    for (const p of WEBHOOK_PRESETS) expect(p.events.length).toBeGreaterThan(0);
  });
});
