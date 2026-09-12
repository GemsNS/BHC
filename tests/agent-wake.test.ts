import { afterEach, describe, expect, it } from "vitest";
import {
  agentAutonomyLevel,
  agentMaxRunsPerDay,
  agentMinGapMinutes,
  agentRunsToday,
  agentWakeGapElapsed,
  agentWakeReasons,
  decideAgentRun,
  lastAgentRunAt,
  parseAutonomyLevel,
} from "@/lib/agent-wake";
import { agentOpsDue, runAutomationTick } from "@/lib/automation-engine";
import { normalizeStore } from "@/lib/normalize";
import { buildSeedData } from "@/lib/seed";
import type { AppData } from "@/lib/types";

const NOW = Date.parse("2026-09-11T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;

afterEach(() => {
  delete process.env.AGENT_AUTONOMY;
  delete process.env.AGENT_HARNESS_MIN_GAP_MIN;
  delete process.env.AGENT_HARNESS_INTERVAL_MIN;
  delete process.env.AGENT_HARNESS_MAX_RUNS_PER_DAY;
  delete process.env.AGENT_HARNESS_ENABLED;
});

function ad(data: AppData, over: Partial<AppData["adListings"][number]>) {
  data.adListings.unshift({
    id: `ad-${data.adListings.length + 1}`,
    sourceId: "s",
    sourceName: "s",
    externalId: `x-${data.adListings.length + 1}`,
    url: "",
    title: "Looking for siding contractor",
    body: "",
    location: "",
    postedAt: null,
    fetchedAt: iso(NOW - 5 * MIN),
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    status: "qualified",
    score: 80,
    category: "siding",
    jobType: null,
    summary: "",
    reasons: [],
    classifiedBy: null,
    leadId: null,
    outreachIds: [],
    repliedAt: null,
    notes: "",
    ...over,
  });
}

describe("autonomy env", () => {
  it("parses tiers and defaults to assist", () => {
    expect(parseAutonomyLevel("FULL")).toBe("full");
    expect(parseAutonomyLevel("nope")).toBeNull();
    expect(agentAutonomyLevel()).toBe("assist");
    process.env.AGENT_AUTONOMY = "observe";
    expect(agentAutonomyLevel()).toBe("observe");
  });

  it("clamps knobs", () => {
    expect(agentMinGapMinutes()).toBe(10);
    process.env.AGENT_HARNESS_MIN_GAP_MIN = "0";
    expect(agentMinGapMinutes()).toBe(1);
    process.env.AGENT_HARNESS_MAX_RUNS_PER_DAY = "abc";
    expect(agentMaxRunsPerDay()).toBe(48);
  });
});

describe("agentWakeReasons", () => {
  it("is quiet on a fresh store", () => {
    const data = buildSeedData();
    expect(agentWakeReasons(data, iso(NOW - 60 * MIN), NOW)).toEqual([]);
  });

  it("wakes for new qualified ads, replies, inbound messages, tick errors, finished scans", () => {
    const data = buildSeedData();
    const since = iso(NOW - 30 * MIN);
    ad(data, { status: "qualified", fetchedAt: iso(NOW - 10 * MIN) });
    ad(data, { status: "sent", repliedAt: iso(NOW - 3 * MIN), fetchedAt: iso(NOW - 3 * 60 * MIN) });
    data.messages.unshift({
      id: "m1",
      channel: "sms",
      direction: "in",
      from: "+19025550100",
      to: "+19025550101",
      subject: "",
      body: "Can you come Tuesday?",
      leadId: null,
      jobId: null,
      adId: null,
      provider: "twilio",
      providerId: null,
      status: "received",
      readAt: null,
      recordingUrl: null,
      transcription: null,
      durationSec: null,
      createdAt: iso(NOW - 2 * MIN),
    });
    data.automationRuns.unshift({
      id: "t1",
      source: "scheduler",
      startedAt: iso(NOW - 6 * MIN),
      finishedAt: iso(NOW - 5 * MIN),
      durationMs: 100,
      results: [],
      counters: { automationsRun: 1, notificationsCreated: 0, tasksCreated: 0, sequenceSteps: 0, webhooksSent: 0, webhooksFailed: 0, workflowsRun: 0, backupCreated: false },
      errors: ["ad_ingest: IMAP login failed"],
    });
    data.scoutTasks.unshift({
      id: "st1",
      platform: "kijiji",
      query: "deck",
      region: "HRM",
      status: "done",
      requestedBy: "agent",
      note: "",
      createdAt: since,
      claimedAt: since,
      claimedBy: "pc",
      completedAt: iso(NOW - 1 * MIN),
      found: 4,
      created: 2,
      error: null,
    });
    const reasons = agentWakeReasons(data, since, NOW);
    expect(reasons.join("\n")).toMatch(/1 new qualified job ad/);
    expect(reasons.join("\n")).toMatch(/1 prospect\(s\) replied/);
    expect(reasons.join("\n")).toMatch(/1 unread inbound message\(s\) \(sms\)/);
    expect(reasons.join("\n")).toMatch(/last engine tick had 1 error/);
    expect(reasons.join("\n")).toMatch(/1 scout scan\(s\) finished \(2 new listing\(s\)\)/);
    // nothing since the last run → nothing
    expect(agentWakeReasons(data, iso(NOW), NOW)).toEqual([]);
  });
});

describe("decideAgentRun", () => {
  it("runs on schedule regardless of events", () => {
    const data = buildSeedData();
    const d = decideAgentRun(data, { scheduledDue: true, lastRunAt: iso(NOW - MIN), nowMs: NOW });
    expect(d.due).toBe(true);
    expect(d.trigger).toBe("schedule");
  });

  it("wakes on events only after the minimum gap", () => {
    const data = buildSeedData();
    ad(data, { status: "drafted", fetchedAt: iso(NOW - 2 * MIN) });
    const tooSoon = decideAgentRun(data, { scheduledDue: false, lastRunAt: iso(NOW - 5 * MIN), nowMs: NOW });
    expect(tooSoon.due).toBe(false);
    expect(tooSoon.wakeReasons.length).toBe(1);
    const ok = decideAgentRun(data, { scheduledDue: false, lastRunAt: iso(NOW - 15 * MIN), nowMs: NOW });
    expect(ok.due).toBe(true);
    expect(ok.trigger).toBe("wake");
    expect(agentWakeGapElapsed(iso(NOW - 15 * MIN), NOW)).toBe(true);
  });

  it("honours AGENT_HARNESS_INTERVAL_MIN over the stored interval", () => {
    const data = buildSeedData();
    process.env.AGENT_HARNESS_INTERVAL_MIN = "5";
    const d = decideAgentRun(data, { scheduledDue: false, lastRunAt: iso(NOW - 6 * MIN), nowMs: NOW });
    expect(d.due).toBe(true);
    expect(d.trigger).toBe("schedule");
    process.env.AGENT_HARNESS_INTERVAL_MIN = "120";
    const late = decideAgentRun(data, { scheduledDue: true, lastRunAt: iso(NOW - 61 * MIN), nowMs: NOW });
    expect(late.due).toBe(false);
  });
});

describe("agentRunsToday / lastAgentRunAt", () => {
  it("counts only non-skipped runs from today", () => {
    const data = buildSeedData();
    const base = {
      trigger: "schedule" as const,
      autonomy: "assist" as const,
      durationMs: 1,
      did: [],
      needsHuman: [],
      noted: [],
      toolRuns: [],
      wakeReasons: [],
      webSearches: 0,
      estimatedTokens: 0,
      error: null,
    };
    data.agentRuns = [
      { ...base, id: "r1", startedAt: iso(NOW - MIN), finishedAt: iso(NOW), skipped: null },
      { ...base, id: "r2", startedAt: iso(NOW - 2 * MIN), finishedAt: iso(NOW - MIN), skipped: "budget" },
      { ...base, id: "r3", startedAt: iso(NOW - 48 * 60 * MIN), finishedAt: iso(NOW - 48 * 60 * MIN), skipped: null },
    ];
    expect(agentRunsToday(data, NOW)).toBe(1);
    expect(lastAgentRunAt(data)).toBe(iso(NOW));
  });
});

describe("engine integration", () => {
  it("agentOpsDue wakes agent_ops and the tick reports the wake reasons", async () => {
    process.env.AGENT_HARNESS_ENABLED = "1";
    const data = normalizeStore(buildSeedData());
    const auto = data.assistantAutomations.find((a) => a.action === "agent_ops")!;
    auto.enabled = true;
    auto.lastRunAt = iso(NOW - 20 * MIN); // interval 60 → not scheduled yet
    ad(data, { status: "qualified", fetchedAt: iso(NOW - 3 * MIN) });
    const decision = agentOpsDue(data, auto, NOW);
    expect(decision.due).toBe(true);
    expect(decision.trigger).toBe("wake");

    let seen: { trigger: string; wakeReasons: string[] } | null = null;
    let n = 0;
    const record = await runAutomationTick(data, {
      source: "test",
      now: NOW,
      only: [auto.id],
      newId: () => `id-${++n}`,
      nowIso: () => iso(NOW),
      agentOps: async (_d, info) => {
        seen = info;
        return { summary: "agent ran" };
      },
    });
    expect(seen).not.toBeNull();
    expect(seen!.trigger).toBe("wake");
    expect(seen!.wakeReasons[0]).toMatch(/new qualified job ad/);
    expect(record.results[0]).toMatch(/agent ran · woke:/);
    expect(auto.lastRunAt).toBe(iso(NOW));

    // Now nothing new + gap not elapsed → not due
    const again = agentOpsDue(data, auto, NOW + 2 * MIN);
    expect(again.due).toBe(false);
  });

  it("does not wake when the agent hook is absent (browser demo)", async () => {
    const data = normalizeStore(buildSeedData());
    const auto = data.assistantAutomations.find((a) => a.action === "agent_ops")!;
    auto.enabled = true;
    auto.lastRunAt = iso(NOW - 20 * MIN);
    ad(data, { status: "qualified", fetchedAt: iso(NOW - 3 * MIN) });
    let n = 0;
    const record = await runAutomationTick(data, {
      source: "test",
      now: NOW,
      only: [auto.id],
      newId: () => `id-${++n}`,
      nowIso: () => iso(NOW),
    });
    expect(record.results.some((r) => /agent/i.test(r))).toBe(false);
    expect(auto.lastRunAt).toBe(iso(NOW - 20 * MIN));
  });

  it("normalize adds the v11 collections to an old store", () => {
    const raw = buildSeedData() as Partial<AppData>;
    delete raw.agentRuns;
    delete raw.scoutTasks;
    delete raw.scoutRunners;
    const data = normalizeStore(raw as AppData);
    expect(data.agentRuns).toEqual([]);
    expect(data.scoutTasks).toEqual([]);
    expect(data.scoutRunners).toEqual([]);
  });
});
