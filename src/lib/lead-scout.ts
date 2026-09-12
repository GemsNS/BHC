/**
 * Lead scout — server-side half of the own-PC web scraper.
 *
 * The Mainframe agent (or an operator) queues **scout tasks** ("scan Kijiji for
 * 'need a deck built'"). A scout runner process (`scripts/lead-scout.ts`)
 * running on the owner's PC — a residential IP that Kijiji / Craigslist / Reddit
 * do not block the way they block cloud hosts — heartbeats in, claims tasks,
 * scrapes, and POSTs normalized listings back to `/api/scout`. Results flow
 * through the normal ad pipeline (dedupe → triage → lead → drafted reply).
 *
 * Everything here is pure over `AppData` (no fs / network) so the API route,
 * the agent tools, the CLI, and tests share one implementation.
 */

import {
  ingestRawAds,
  newAdSource,
  type IngestContext,
  type RawAd,
} from "./ad-ingest";
import { live } from "./events";
import { FACEBOOK_DEMAND_QUERIES } from "./facebook-marketplace";
import {
  DEFAULT_AD_EXCLUDE_KEYWORDS,
  DEMAND_INTENT_RE,
  PUBLIC_HTML_EXTRA_EXCLUDE,
  looksLikeDemand,
  mentionsExteriorTrade,
} from "./lead-search-recipes";
import { isRealHttpUrl } from "./outreach-guard";
import type {
  AdListing,
  AdSource,
  AppData,
  ScoutPlatform,
  ScoutRunner,
  ScoutTask,
} from "./types";

export const SCOUT_PLATFORMS: readonly ScoutPlatform[] = [
  "kijiji",
  "craigslist",
  "reddit",
  "facebook",
  "web",
] as const;

export const SCOUT_PLATFORM_LABELS: Record<ScoutPlatform, string> = {
  kijiji: "Kijiji",
  craigslist: "Craigslist",
  reddit: "Reddit",
  facebook: "Facebook Marketplace",
  web: "Web search",
};

export const SCOUT_DEFAULT_REGION = "Halifax Regional Municipality";

/** Homeowner-demand phrases the runner sweeps when no specific task is queued. */
export const SCOUT_DEFAULT_QUERIES: Record<ScoutPlatform, string[]> = {
  // Kijiji ANDs every word: bare trade terms find the ads, the demand filter keeps
  // only the homeowner asks.
  kijiji: ["siding", "soffit fascia", "deck", "windows doors", "eavestrough gutters", "exterior contractor"],
  facebook: [...FACEBOOK_DEMAND_QUERIES],
  // Craigslist Halifax is small; short terms across sss + gigs catch what exists.
  craigslist: ["siding", "deck", "windows", "soffit", "contractor", "renovation"],
  // Reddit rate-limits unauthenticated feeds hard (~10 req/min per IP): two OR
  // queries cover every trade instead of six narrow ones.
  reddit: [
    "(siding OR soffit OR fascia OR deck OR windows OR gutters OR eavestrough) (looking OR recommend OR contractor OR quote)",
    "(contractor OR carpenter OR renovation OR exterior OR roofing OR fence) (looking OR recommend OR quote OR hire)",
  ],
  web: [
    "looking for siding contractor Halifax",
    "need a deck built Dartmouth",
    "window replacement quote Bedford",
    "soffit fascia repair Halifax",
    "exterior contractor recommendations HRM",
  ],
};

/** Queued-task ceiling — the agent cannot flood the runner. */
export const SCOUT_MAX_QUEUED = 50;
const SCOUT_TASK_CAP = 200;
const SCOUT_RUNNER_CAP = 10;
const SCOUT_RUNNING_STALE_MS = 2 * 60 * 60_000;

export function parseScoutPlatform(v: unknown): ScoutPlatform | null {
  if (typeof v !== "string") return null;
  const key = v.trim().toLowerCase();
  return (SCOUT_PLATFORMS as readonly string[]).includes(key) ? (key as ScoutPlatform) : null;
}

export function scoutSourceId(platform: ScoutPlatform): string {
  return `adsrc-scout-${platform}`;
}

/** Find (or create) the per-platform ad source the scout posts into. */
export function ensureScoutSource(
  data: AppData,
  platform: ScoutPlatform,
  ctx: IngestContext,
): AdSource {
  const id = scoutSourceId(platform);
  const existing = data.adSources.find((s) => s.id === id);
  if (existing) return existing;
  const src = newAdSource(
    {
      id,
      name: `Lead scout — ${SCOUT_PLATFORM_LABELS[platform]} (own PC)`,
      type: "webhook",
      enabled: true,
      keywords: [],
      excludeKeywords: [...DEFAULT_AD_EXCLUDE_KEYWORDS, ...PUBLIC_HTML_EXTRA_EXCLUDE],
      region: SCOUT_DEFAULT_REGION,
    },
    ctx,
  );
  data.adSources.push(src);
  return src;
}

function normQuery(q: string): string {
  return q.trim().replace(/\s+/g, " ").toLowerCase();
}

export type EnqueueScoutInput = {
  platform: ScoutPlatform;
  query: string;
  region?: string;
  requestedBy: string;
  note?: string;
};

/**
 * Queue a scan for the runner. Same platform + query already queued/running →
 * returns that task with `existing: true`. Throws when the queue is full.
 */
export function enqueueScoutTask(
  data: AppData,
  input: EnqueueScoutInput,
  ctx: IngestContext,
): { task: ScoutTask; existing: boolean } {
  const query = input.query.trim().replace(/\s+/g, " ").slice(0, 200);
  if (!query) throw new Error("Scout task needs a query.");
  const key = normQuery(query);
  const dupe = data.scoutTasks.find(
    (t) =>
      t.platform === input.platform &&
      (t.status === "queued" || t.status === "running") &&
      normQuery(t.query) === key,
  );
  if (dupe) return { task: dupe, existing: true };
  const queued = data.scoutTasks.filter((t) => t.status === "queued").length;
  if (queued >= SCOUT_MAX_QUEUED) {
    throw new Error(`Scout queue is full (${SCOUT_MAX_QUEUED} queued) — wait for the runner to catch up.`);
  }
  const task: ScoutTask = {
    id: ctx.newId(),
    platform: input.platform,
    query,
    region: (input.region ?? "").trim() || SCOUT_DEFAULT_REGION,
    status: "queued",
    requestedBy: input.requestedBy || "unknown",
    note: (input.note ?? "").trim().slice(0, 300),
    createdAt: ctx.nowIso(),
    claimedAt: null,
    claimedBy: null,
    completedAt: null,
    found: 0,
    created: 0,
    error: null,
  };
  data.scoutTasks.unshift(task);
  return { task, existing: false };
}

/**
 * Hand queued tasks to a runner. Specific ids when given, else oldest queued
 * first. When the runner has a heartbeat record, only its platforms are claimed.
 */
export function claimScoutTasks(
  data: AppData,
  runnerId: string,
  taskIds: string[] | undefined,
  limit = 5,
  nowIso: () => string = () => new Date().toISOString(),
): ScoutTask[] {
  const runner = data.scoutRunners.find((r) => r.id === runnerId);
  const supports = (t: ScoutTask) => !runner || runner.platforms.length === 0 || runner.platforms.includes(t.platform);
  const wanted = taskIds && taskIds.length ? new Set(taskIds) : null;
  const candidates = data.scoutTasks
    .filter((t) => t.status === "queued" && supports(t) && (!wanted || wanted.has(t.id)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, Math.max(1, Math.min(limit, 20)));
  const stamp = nowIso();
  for (const t of candidates) {
    t.status = "running";
    t.claimedAt = stamp;
    t.claimedBy = runnerId;
    t.error = null;
  }
  return candidates;
}

export type CompleteScoutInput = {
  taskId: string;
  runnerId: string;
  found: number;
  created: number;
  error?: string | null;
};

/** Mark a claimed task done/failed and roll its counts into the runner record. */
export function completeScoutTask(
  data: AppData,
  input: CompleteScoutInput,
  nowIso: () => string = () => new Date().toISOString(),
): ScoutTask | null {
  const task = data.scoutTasks.find((t) => t.id === input.taskId);
  if (!task) return null;
  if (task.status === "done" || task.status === "failed") return task; // idempotent
  const err = (input.error ?? "").trim();
  task.status = err ? "failed" : "done";
  task.error = err ? err.slice(0, 300) : null;
  task.completedAt = nowIso();
  task.claimedBy = task.claimedBy ?? input.runnerId;
  task.found = Math.max(0, Math.floor(input.found || 0));
  task.created = Math.max(0, Math.floor(input.created || 0));
  const runner = data.scoutRunners.find((r) => r.id === input.runnerId);
  if (runner) {
    runner.tasksDone += 1;
    runner.adsPosted += task.created;
    runner.lastRunAt = task.completedAt;
  }
  return task;
}

export type ScoutRunnerInput = {
  id: string;
  name: string;
  host: string;
  version: string;
  platforms: ScoutPlatform[];
};

/** Upsert a runner heartbeat (capped; the runner with the oldest heartbeat is evicted). */
export function heartbeatScoutRunner(
  data: AppData,
  runner: ScoutRunnerInput,
  nowIso: () => string = () => new Date().toISOString(),
  summary?: string,
): ScoutRunner {
  const stamp = nowIso();
  const id = runner.id.trim().slice(0, 80) || "runner";
  let rec = data.scoutRunners.find((r) => r.id === id);
  if (!rec) {
    rec = {
      id,
      name: runner.name.trim().slice(0, 80) || id,
      host: runner.host.trim().slice(0, 120),
      version: runner.version.trim().slice(0, 40),
      platforms: [],
      lastSeenAt: stamp,
      lastRunAt: null,
      lastSummary: "",
      tasksDone: 0,
      adsPosted: 0,
    };
    data.scoutRunners.push(rec);
  }
  rec.name = runner.name.trim().slice(0, 80) || rec.name;
  rec.host = runner.host.trim().slice(0, 120) || rec.host;
  rec.version = runner.version.trim().slice(0, 40) || rec.version;
  rec.platforms = [...new Set(runner.platforms.filter((p) => SCOUT_PLATFORMS.includes(p)))];
  rec.lastSeenAt = stamp;
  if (summary != null && summary.trim()) rec.lastSummary = summary.trim().slice(0, 300);
  if (data.scoutRunners.length > SCOUT_RUNNER_CAP) {
    data.scoutRunners.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    data.scoutRunners.length = SCOUT_RUNNER_CAP;
  }
  return rec;
}

export function runnerOnline(runner: ScoutRunner, nowMs = Date.now(), minutes = 30): boolean {
  const seen = new Date(runner.lastSeenAt).getTime();
  if (!Number.isFinite(seen)) return false;
  return nowMs - seen <= minutes * 60_000;
}

/** Requeue tasks a runner died on and cap history (never drops queued/running). */
export function pruneScout(
  data: AppData,
  nowIso: () => string = () => new Date().toISOString(),
): { requeued: number; dropped: number } {
  const nowMs = new Date(nowIso()).getTime();
  let requeued = 0;
  for (const t of data.scoutTasks) {
    if (t.status !== "running") continue;
    const claimed = t.claimedAt ? new Date(t.claimedAt).getTime() : NaN;
    if (!Number.isFinite(claimed) || nowMs - claimed > SCOUT_RUNNING_STALE_MS) {
      t.status = "queued";
      t.claimedAt = null;
      t.claimedBy = null;
      requeued += 1;
    }
  }
  let dropped = 0;
  if (data.scoutTasks.length > SCOUT_TASK_CAP) {
    const active = data.scoutTasks.filter((t) => t.status === "queued" || t.status === "running");
    const finished = data.scoutTasks
      .filter((t) => t.status === "done" || t.status === "failed")
      .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
    const keep = Math.max(0, SCOUT_TASK_CAP - active.length);
    dropped = Math.max(0, finished.length - keep);
    data.scoutTasks = [...active, ...finished.slice(0, keep)].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
  return { requeued, dropped };
}

export type ScoutStatus = {
  runners: Array<ScoutRunner & { online: boolean }>;
  onlineRunners: number;
  queued: number;
  running: number;
  doneToday: number;
  failedToday: number;
  recent: ScoutTask[];
  sources: number;
};

export function scoutStatus(data: AppData, nowMs = Date.now()): ScoutStatus {
  const today = new Date(nowMs).toDateString();
  const finishedToday = (t: ScoutTask) =>
    Boolean(t.completedAt) && new Date(t.completedAt!).toDateString() === today;
  const runners = data.scoutRunners
    .map((r) => ({ ...r, online: runnerOnline(r, nowMs) }))
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  return {
    runners,
    onlineRunners: runners.filter((r) => r.online).length,
    queued: data.scoutTasks.filter((t) => t.status === "queued").length,
    running: data.scoutTasks.filter((t) => t.status === "running").length,
    doneToday: data.scoutTasks.filter((t) => t.status === "done" && finishedToday(t)).length,
    failedToday: data.scoutTasks.filter((t) => t.status === "failed" && finishedToday(t)).length,
    recent: [...data.scoutTasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10),
    sources: data.adSources.filter((s) => s.id.startsWith("adsrc-scout-")).length,
  };
}

/** Title-only listings still count as demand when the title itself is an ask for exterior work. */
/** Trades BHC quotes beyond the core siding/deck/window list (roofing, fencing, painting, general exterior). */
const SCOUT_TRADE_RE =
  /\b(roof(ing|er|ers)?|shingles?|fenc(e|ing)|exterior|siding|soffit|fascia|deck(s|ing)?|window(s)?|door(s)?|gutter(s)?|eavestrough(s)?|cladding|building envelope|paint(ing|er|ers)?|renovat(e|ion|ions)|reno|contractor|carpenter|handyman)\b/i;

/**
 * Demand rule for scraped listings: someone asking for work (intent, no supply
 * pitch, not real estate) AND the ask mentions a trade BHC does. "Anyone
 * recommend a restaurant?" has intent but no trade, so it never reaches triage.
 */
export function scoutRawLooksLikeDemand(raw: Pick<RawAd, "title" | "body">): boolean {
  const title = raw.title ?? "";
  const body = raw.body ?? "";
  const text = `${title}\n${body}`;
  const trade = mentionsExteriorTrade(text) || SCOUT_TRADE_RE.test(text);
  if (!trade) return false;
  if (looksLikeDemand(text)) return true;
  return !body.trim() && DEMAND_INTENT_RE.test(title);
}

/**
 * Store listings a runner scraped. Requires a real listing URL for every
 * platform; drops supply / for-sale noise unless `demandOnly: false`.
 */
export function ingestScoutResults(
  data: AppData,
  platform: ScoutPlatform,
  raws: RawAd[],
  ctx: IngestContext,
  opts: { demandOnly?: boolean } = {},
): { created: AdListing[]; filtered: number; received: number } {
  const demandOnly = opts.demandOnly !== false;
  const received = raws.length;
  const kept: RawAd[] = [];
  for (const raw of raws) {
    if (!raw || typeof raw.title !== "string" || !raw.title.trim()) continue;
    if (!isRealHttpUrl(raw.url)) continue;
    if (demandOnly && !scoutRawLooksLikeDemand(raw)) continue;
    kept.push({ ...raw, body: raw.body ?? "", location: raw.location || "Halifax" });
  }
  const source = ensureScoutSource(data, platform, ctx);
  const created = ingestRawAds(data, source, kept, ctx);
  source.lastPolledAt = ctx.nowIso();
  source.lastError = null;
  if (created.length) {
    live.discovery(
      `Lead scout (${SCOUT_PLATFORM_LABELS[platform]}): ${created.length} new listing(s)`,
      `${received} received · ${received - kept.length} filtered as supply / noise`,
      "success",
    );
  }
  return { created, filtered: received - kept.length, received };
}
