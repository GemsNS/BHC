import { describe, expect, it } from "vitest";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { buildSeedData } from "../src/lib/seed";
import { normalizeStore } from "../src/lib/normalize";
import { automationStatus, runAutomationTick } from "../src/lib/automation-engine";
import { AUTOMATION_CATALOG, ensureDefaultAutomations } from "../src/lib/automation-defaults";
import {
  checkInventory,
  checkInvoices,
  checkJobHealth,
  checkTaskReminders,
  checkToolCheckouts,
  runDailyDigest,
} from "../src/lib/automation-checks";
import { isAutomationDue, runDailyAutomations } from "../src/lib/mainframe-automations";
import type { AppData } from "../src/lib/types";

let counter = 0;
const ctx = {
  newId: () => `id-${++counter}`,
  nowIso: () => new Date().toISOString(),
};

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function seeded(): AppData {
  return normalizeStore(buildDemoSeedData());
}

describe("automation defaults", () => {
  it("adds every catalog automation to an old store without touching existing ones", () => {
    const existing = buildSeedData().assistantAutomations.map((a) => ({ ...a, enabled: false }));
    const merged = ensureDefaultAutomations(existing);
    expect(merged.length).toBe(AUTOMATION_CATALOG.length);
    for (const entry of AUTOMATION_CATALOG) {
      expect(merged.some((a) => a.action === entry.action)).toBe(true);
    }
    // operator choice preserved
    const pipeline = merged.find((a) => a.action === "pipeline_scan")!;
    expect(pipeline.enabled).toBe(false);
    // interval metadata comes from the catalog
    expect(merged.find((a) => a.action === "task_reminders")!.intervalMinutes).toBe(15);
    // idempotent
    expect(ensureDefaultAutomations(merged)).toBe(merged);
    // backfills intervalMinutes on legacy records
    const legacy = merged.map((a) => ({ ...a, intervalMinutes: undefined }));
    const filled = ensureDefaultAutomations(legacy);
    expect(filled.find((a) => a.action === "webhook_retry")!.intervalMinutes).toBe(15);
  });

  it("normalizeStore fills automationRuns and workflow templates (disabled)", () => {
    const raw = buildDemoSeedData() as Partial<AppData>;
    delete (raw as Record<string, unknown>).automationRuns;
    const data = normalizeStore(raw);
    expect(Array.isArray(data.automationRuns)).toBe(true);
    const template = data.workflows.find((w) => w.id === "wf-job-completed-invoice");
    expect(template).toBeDefined();
    expect(template!.enabled).toBe(false);
  });
});

describe("due logic", () => {
  it("interval automations are due once the interval has elapsed", () => {
    const now = Date.now();
    const auto = {
      id: "x",
      name: "x",
      description: "",
      enabled: true,
      runHour: 0,
      intervalMinutes: 15,
      action: "task_reminders" as const,
      lastRunAt: new Date(now - 10 * 60_000).toISOString(),
    };
    expect(isAutomationDue(auto, now)).toBe(false);
    auto.lastRunAt = new Date(now - 16 * 60_000).toISOString();
    expect(isAutomationDue(auto, now)).toBe(true);
  });

  it("daily automations run once per day after runHour", () => {
    const at = new Date();
    at.setHours(9, 0, 0, 0);
    const auto = {
      id: "y",
      name: "y",
      description: "",
      enabled: true,
      runHour: 8,
      action: "pipeline_scan" as const,
      lastRunAt: null as string | null,
    };
    expect(isAutomationDue(auto, at.getTime())).toBe(true);
    auto.lastRunAt = at.toISOString();
    expect(isAutomationDue(auto, at.getTime() + 60_000)).toBe(false);
    const early = new Date(at);
    early.setHours(6);
    auto.lastRunAt = null;
    expect(isAutomationDue(auto, early.getTime())).toBe(false);
  });
});

describe("ops checks are idempotent", () => {
  it("invoice follow-up creates one task and one alert per overdue invoice", () => {
    const data = seeded();
    const job = data.jobs[0];
    data.invoices.unshift({
      id: "inv-old",
      jobId: job.id,
      kind: "invoice",
      status: "sent",
      customerName: "Late Payer",
      lines: [],
      includeProgress: false,
      progressEntryIds: [],
      notes: "",
      aiSummary: null,
      createdAt: ago(45),
      createdById: "emp-admin",
    });
    const tasksBefore = data.activities.length;
    const first = checkInvoices(data, ctx);
    expect(first.tasks).toBe(1);
    expect(first.notifications).toBe(1);
    const second = checkInvoices(data, ctx);
    expect(second.tasks).toBe(0);
    expect(second.notifications).toBe(0);
    expect(data.activities.length).toBe(tasksBefore + 1);
    expect(data.activities[0].subject).toContain("Collect payment");
  });

  it("job health flags silent jobs and completed jobs without invoices", () => {
    const data = seeded();
    data.jobs = [
      {
        id: "job-silent",
        title: "Silent siding",
        customerName: "Quiet Co",
        address: "1 Hush Ln",
        jobType: "residential",
        status: "in_progress",
        leadId: null,
        crewLeadId: "emp-admin",
        startDate: "2026-01-01",
        estimatedValue: 1000,
        contractValue: 1000,
        notes: "",
        createdAt: ago(20),
      },
      {
        id: "job-done",
        title: "Finished deck",
        customerName: "Done Inc",
        address: "2 Done St",
        jobType: "residential",
        status: "completed",
        leadId: null,
        crewLeadId: null,
        startDate: "2026-01-01",
        estimatedValue: 5000,
        contractValue: 5000,
        notes: "",
        createdAt: ago(30),
      },
    ];
    data.jobProgress = [];
    data.invoices = [];
    const r = checkJobHealth(data, ctx);
    expect(r.notifications).toBeGreaterThanOrEqual(1);
    expect(r.tasks).toBe(1);
    expect(data.activities.some((a) => a.subject.startsWith("Create invoice: Finished deck"))).toBe(true);
    const again = checkJobHealth(data, ctx);
    expect(again.tasks).toBe(0);
    expect(again.notifications).toBe(0);
  });

  it("inventory reorder alerts dedupe within a day", () => {
    const data = seeded();
    data.inventory = [
      {
        id: "sku-1",
        sku: "SID-01",
        name: "Vinyl siding",
        category: "siding",
        unit: "box",
        quantityOnHand: 2,
        reorderLevel: 5,
        unitCost: 40,
        location: "yard",
      },
    ];
    expect(checkInventory(data, ctx).notifications).toBe(1);
    expect(checkInventory(data, ctx).notifications).toBe(0);
    expect(data.notifications[0].dedupeKey).toBe("inventory-low:sku-1");
  });

  it("tool checkout overdue reminds the borrower once", () => {
    const data = seeded();
    data.tools = [
      {
        id: "tool-1",
        name: "Brake",
        category: "hand",
        assetTag: "T1",
        status: "checked_out",
        checkedOutToId: "emp-admin",
        checkedOutAt: ago(10),
        jobId: null,
        notes: "",
      },
    ];
    data.toolCheckouts = [
      {
        id: "co-1",
        toolId: "tool-1",
        employeeId: "emp-admin",
        jobId: null,
        checkedOutAt: ago(10),
        checkedInAt: null,
        notes: "",
      },
    ];
    expect(checkToolCheckouts(data, ctx).notifications).toBe(1);
    expect(data.notifications[0].employeeId).toBe("emp-admin");
    expect(checkToolCheckouts(data, ctx).notifications).toBe(0);
  });

  it("task reminders mark knocker todos as reminded", () => {
    const data = seeded();
    data.knockTodos = [
      {
        id: "todo-1",
        pinId: null,
        title: "Call back Mrs. Lee",
        body: "",
        dueAt: new Date(Date.now() - 60_000).toISOString(),
        priority: "high",
        assignedToId: "emp-admin",
        completedAt: null,
        createdAt: ago(1),
        calendarEventId: null,
        reminderSentAt: null,
      },
    ];
    expect(checkTaskReminders(data, ctx).notifications).toBe(1);
    expect(data.knockTodos[0].reminderSentAt).toBeTruthy();
    expect(checkTaskReminders(data, ctx).notifications).toBe(0);
  });

  it("daily digest posts one summary per day", () => {
    const data = seeded();
    expect(runDailyDigest(data, ctx).notifications).toBe(1);
    expect(runDailyDigest(data, ctx).notifications).toBe(0);
    expect(data.notifications[0].title).toBe("Daily ops digest");
  });
});

describe("engine tick", () => {
  it("runs due automations, records a tick, and never double-creates on a second tick", async () => {
    const data = seeded();
    const before = data.notifications.length;
    const record = await runAutomationTick(data, {
      source: "test",
      force: true,
      newId: ctx.newId,
      nowIso: ctx.nowIso,
      network: false,
    });
    expect(record.counters.automationsRun).toBeGreaterThan(0);
    expect(data.automationRuns[0].id).toBe(record.id);
    expect(record.errors).toEqual([]);
    // server-only automations are skipped, not failed, without hooks
    expect(record.results.some((r) => r.includes("skipped"))).toBe(true);
    const createdFirst = data.notifications.length - before;

    const second = await runAutomationTick(data, {
      source: "test",
      force: true,
      newId: ctx.newId,
      nowIso: ctx.nowIso,
      network: false,
    });
    expect(second.counters.notificationsCreated).toBe(0);
    expect(data.notifications.length - before).toBe(createdFirst);
    expect(data.automationRuns.length).toBe(2);
  });

  it("calls the backup hook and reports it", async () => {
    const data = seeded();
    let called = 0;
    const record = await runAutomationTick(data, {
      source: "test",
      force: true,
      only: ["auto-backup"],
      newId: ctx.newId,
      nowIso: ctx.nowIso,
      backup: async () => {
        called += 1;
        return "store-test.json";
      },
    });
    expect(called).toBe(1);
    expect(record.counters.backupCreated).toBe(true);
    expect(record.results[0]).toContain("store-test.json");
  });

  it("automationStatus summarises due and backlog", async () => {
    const data = seeded();
    const status = automationStatus(data);
    expect(status.automations.length).toBe(data.assistantAutomations.length);
    expect(status.lastTick).toBeNull();
    await runAutomationTick(data, { source: "test", newId: ctx.newId, nowIso: ctx.nowIso });
    expect(automationStatus(data).lastTick).not.toBeNull();
  });

  it("legacy runDailyAutomations still returns summaries", () => {
    const data = seeded();
    const out = runDailyAutomations(data, ctx.newId, { force: true });
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((l) => l.includes("Pipeline scan"))).toBe(true);
  });
});
