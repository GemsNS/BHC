/**
 * Agent wake logic + runtime knobs for the autonomous Mainframe agent.
 *
 * The agent normally runs on its automation interval. Between runs it can be
 * *woken* early when something happened that a human ops manager would react
 * to right away: a fresh qualified ad, a prospect reply, an inbound message,
 * a failed engine tick, or a finished scout scan. Waking respects a minimum
 * gap so a burst of events never turns into a burst of AI calls.
 *
 * Everything here is pure over `AppData` so the engine and tests share it.
 */

import type { AgentAutonomyLevel, AppData } from "./types";

const LEVELS: readonly AgentAutonomyLevel[] = ["observe", "assist", "operate", "full"];

export function parseAutonomyLevel(value: unknown): AgentAutonomyLevel | null {
  const v = String(value ?? "").trim().toLowerCase();
  return (LEVELS as readonly string[]).includes(v) ? (v as AgentAutonomyLevel) : null;
}

/** AGENT_AUTONOMY=observe|assist|operate|full (default assist). */
export function agentAutonomyLevel(): AgentAutonomyLevel {
  return parseAutonomyLevel(process.env.AGENT_AUTONOMY) ?? "assist";
}

export function autonomyRank(level: AgentAutonomyLevel): number {
  return LEVELS.indexOf(level);
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Minimum minutes between two agent runs when woken by events (default 10). */
export function agentMinGapMinutes(): number {
  return envInt("AGENT_HARNESS_MIN_GAP_MIN", 10, 1, 24 * 60);
}

/** Optional override of the stored agent_ops interval (minutes). */
export function agentIntervalOverrideMinutes(): number | null {
  const raw = process.env.AGENT_HARNESS_INTERVAL_MIN?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

/** Hard cap on unattended runs per UTC day (default 48 = one every 30 min). */
export function agentMaxRunsPerDay(): number {
  return envInt("AGENT_HARNESS_MAX_RUNS_PER_DAY", 48, 1, 1000);
}

/** Runs recorded today (UTC) that were not skipped. */
export function agentRunsToday(data: AppData, nowMs = Date.now()): number {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  return (data.agentRuns ?? []).filter((r) => !r.skipped && r.startedAt.slice(0, 10) === day).length;
}

export function lastAgentRunAt(data: AppData): string | null {
  const auto = data.assistantAutomations.find((a) => a.action === "agent_ops");
  const fromAuto = auto?.lastRunAt ?? null;
  const fromRuns = (data.agentRuns ?? []).find((r) => !r.skipped)?.finishedAt ?? null;
  if (fromAuto && fromRuns) return fromAuto > fromRuns ? fromAuto : fromRuns;
  return fromAuto ?? fromRuns;
}

function after(iso: string | null | undefined, sinceMs: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t > sinceMs;
}

/**
 * Reasons the agent should wake before its next scheduled run. Empty when
 * nothing notable happened since `lastRunAt` (or since 24 h ago when the agent
 * never ran). Each reason is a short human sentence used in the briefing.
 */
export function agentWakeReasons(
  data: AppData,
  lastRunAt: string | null,
  nowMs = Date.now(),
): string[] {
  const since = lastRunAt ? new Date(lastRunAt).getTime() : nowMs - 24 * 60 * 60_000;
  const reasons: string[] = [];

  const freshAds = data.adListings.filter(
    (a) => (a.status === "qualified" || a.status === "drafted") && after(a.fetchedAt, since),
  );
  if (freshAds.length) {
    reasons.push(
      `${freshAds.length} new qualified job ad(s): ${freshAds
        .slice(0, 3)
        .map((a) => a.title.slice(0, 50))
        .join(" · ")}`,
    );
  }

  const replied = data.adListings.filter((a) => after(a.repliedAt, since));
  if (replied.length) reasons.push(`${replied.length} prospect(s) replied to outreach`);

  const inbound = data.messages.filter(
    (m) => m.direction === "in" && !m.readAt && after(m.createdAt, since),
  );
  if (inbound.length) {
    const channels = [...new Set(inbound.map((m) => m.channel))].join("/");
    reasons.push(`${inbound.length} unread inbound message(s) (${channels})`);
  }

  const pending = data.outreachQueue.filter(
    (o) => o.status === "pending_approval" && after(o.createdAt, since),
  );
  if (pending.length) reasons.push(`${pending.length} outreach draft(s) waiting for approval`);

  const lastTick = data.automationRuns[0];
  if (lastTick && lastTick.errors.length && after(lastTick.finishedAt, since)) {
    reasons.push(`last engine tick had ${lastTick.errors.length} error(s): ${lastTick.errors[0].slice(0, 80)}`);
  }

  const scans = (data.scoutTasks ?? []).filter(
    (t) => (t.status === "done" || t.status === "failed") && after(t.completedAt, since),
  );
  if (scans.length) {
    const found = scans.reduce((n, t) => n + t.created, 0);
    reasons.push(`${scans.length} scout scan(s) finished (${found} new listing(s))`);
  }

  return reasons;
}

/** True when the wake gap since the last run has elapsed. */
export function agentWakeGapElapsed(lastRunAt: string | null, nowMs = Date.now()): boolean {
  if (!lastRunAt) return true;
  const t = new Date(lastRunAt).getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t >= agentMinGapMinutes() * 60_000;
}

export type AgentDueDecision = {
  due: boolean;
  trigger: "schedule" | "wake" | null;
  wakeReasons: string[];
};

/**
 * Decide whether agent_ops should run on this tick: on schedule (interval,
 * optionally overridden by AGENT_HARNESS_INTERVAL_MIN) or woken by events once
 * the minimum gap has passed. `scheduledDue` is the engine's normal verdict.
 */
export function decideAgentRun(
  data: AppData,
  opts: { scheduledDue: boolean; lastRunAt: string | null; nowMs?: number },
): AgentDueDecision {
  const nowMs = opts.nowMs ?? Date.now();
  const override = agentIntervalOverrideMinutes();
  let scheduled = opts.scheduledDue;
  if (override != null) {
    scheduled = !opts.lastRunAt || nowMs - new Date(opts.lastRunAt).getTime() >= override * 60_000;
  }
  const wakeReasons = agentWakeReasons(data, opts.lastRunAt, nowMs);
  if (scheduled) return { due: true, trigger: "schedule", wakeReasons };
  if (wakeReasons.length && agentWakeGapElapsed(opts.lastRunAt, nowMs)) {
    return { due: true, trigger: "wake", wakeReasons };
  }
  return { due: false, trigger: null, wakeReasons };
}
