import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { normalizeStore } from "../src/lib/normalize";
import { createBackup, listBackups, pruneBackups } from "../src/lib/store-backup";
import { storeHealth } from "../src/lib/store-health";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "bhc-backup-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("store backups", () => {
  it("snapshots the store, lists newest first, and prunes to keep", async () => {
    const storePath = path.join(dir, "store.json");
    await writeFile(storePath, JSON.stringify({ leads: [] }), "utf8");

    const a = await createBackup({ dataDir: dir, storePath, keep: 2, label: "a" });
    await new Promise((r) => setTimeout(r, 1100)); // distinct second-resolution stamps
    const b = await createBackup({ dataDir: dir, storePath, keep: 2, label: "b" });
    await new Promise((r) => setTimeout(r, 1100));
    const c = await createBackup({ dataDir: dir, storePath, keep: 2, label: "c" });

    expect(a && b && c).toBeTruthy();
    const list = await listBackups(dir);
    expect(list).toHaveLength(2);
    expect(list.map((x) => x.name)).toEqual([c!.name, b!.name]);
    expect(JSON.parse(await readFile(list[0].path, "utf8"))).toEqual({ leads: [] });

    expect(await pruneBackups(dir, 1)).toBe(1);
    expect(await listBackups(dir)).toHaveLength(1);
  });

  it("returns null when there is no store yet", async () => {
    const out = await createBackup({ dataDir: dir, storePath: path.join(dir, "missing.json") });
    expect(out).toBeNull();
  });
});

describe("store health", () => {
  it("reports a healthy seeded store", () => {
    const data = normalizeStore(buildDemoSeedData());
    const h = storeHealth(data);
    expect(h.ok).toBe(true);
    expect(h.counts.leads).toBe(data.leads.length);
    expect(h.approxMB).toBeGreaterThanOrEqual(0);
  });

  it("flags dangling invoice → job references as errors", () => {
    const data = normalizeStore(buildDemoSeedData());
    data.invoices.unshift({
      id: "inv-x",
      jobId: "job-does-not-exist",
      kind: "invoice",
      status: "draft",
      customerName: "Ghost",
      lines: [],
      includeProgress: false,
      progressEntryIds: [],
      notes: "",
      aiSummary: null,
      createdAt: new Date().toISOString(),
      createdById: "emp-admin",
    });
    const h = storeHealth(data);
    expect(h.ok).toBe(false);
    expect(h.issues.some((i) => i.code === "invoice_job_missing")).toBe(true);
  });
});
