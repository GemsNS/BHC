import { runAutomationTick } from "./automation-engine";
import { sendEmail } from "./mail";
import { offloadInlineMedia } from "./media-store";
import { sendSms, smsConfigStatus } from "./sms";
import { backupDueToday, createBackup } from "./store-backup";
import { newId, nowIso, readStore, writeStore } from "./store";
import type { AutomationTickRecord } from "./types";
import type { Senders } from "./outreach-send";

/**
 * In-process scheduler for the Node host. Started once from
 * `src/instrumentation.ts` when the server boots.
 *
 * Env:
 *   BHC_SCHEDULER=0                 disable (default: enabled in Node runtime)
 *   BHC_SCHEDULER_INTERVAL_MIN=15   tick cadence (min 1)
 *   BHC_SCHEDULER_INITIAL_DELAY_SEC=45  first tick after boot
 */

type SchedulerState = {
  started: boolean;
  running: boolean;
  intervalMin: number;
  timer: ReturnType<typeof setInterval> | null;
  startedAt: string | null;
  lastTickAt: string | null;
  lastRecord: AutomationTickRecord | null;
  lastError: string | null;
  tickCount: number;
};

const KEY = Symbol.for("bhc.scheduler");

function state(): SchedulerState {
  const g = globalThis as unknown as Record<symbol, SchedulerState | undefined>;
  if (!g[KEY]) {
    g[KEY] = {
      started: false,
      running: false,
      intervalMin: 15,
      timer: null,
      startedAt: null,
      lastTickAt: null,
      lastRecord: null,
      lastError: null,
      tickCount: 0,
    };
  }
  return g[KEY]!;
}

export function schedulerEnabled(): boolean {
  const v = process.env.BHC_SCHEDULER?.trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "off");
}

export function schedulerIntervalMinutes(): number {
  const n = Number(process.env.BHC_SCHEDULER_INTERVAL_MIN ?? "15");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 15;
}

/** Perform the server-side backup hook used by the engine. */
export async function serverBackupHook(force: boolean): Promise<string | null> {
  if (!force && !(await backupDueToday())) return null;
  const info = await createBackup();
  return info?.name ?? null;
}

/** Real senders for the outreach queue — only those that are configured. */
export function serverSenders(): Senders {
  const senders: Senders = {};
  const mailOk = Boolean(
    (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) || process.env.RESEND_API_KEY,
  );
  if (mailOk) {
    senders.email = async (msg) => {
      const r = await sendEmail({ to: msg.to, subject: msg.subject, text: msg.text });
      return { ok: r.ok, provider: r.provider, id: r.id, error: r.error };
    };
  }
  if (smsConfigStatus().configured) {
    senders.sms = async (msg) => {
      const r = await sendSms({ to: msg.to, body: msg.body });
      return { ok: r.ok, provider: r.provider, id: r.id, error: r.error };
    };
  }
  return senders;
}

/**
 * Run a full server tick: read store → engine → write store.
 * Shared by the scheduler, the API route, and the CLI.
 */
export async function runServerTick(opts: {
  source: AutomationTickRecord["source"];
  force?: boolean;
  only?: string[];
}): Promise<AutomationTickRecord> {
  // Node-only modules (IMAP, web discovery, PDF reports) are loaded lazily so the
  // instrumentation hook can be compiled for the edge runtime without them.
  const [imap, discovery, reports] = await Promise.all([
    import("./ad-imap"),
    import("./lead-discovery"),
    import("./job-reports"),
  ]);
  const data = await readStore();
  const record = await runAutomationTick(data, {
    source: opts.source,
    force: opts.force,
    only: opts.only,
    newId,
    nowIso,
    network: true,
    backup: serverBackupHook,
    ads: { pollImap: imap.imapConfigured() ? imap.pollImapInbox : undefined },
    senders: serverSenders(),
    offloadMedia: (d) => offloadInlineMedia(d),
    discover: discovery.discoveryConfigured() ? (d) => discovery.discoverLeadsOnline(d, { newId, nowIso }) : undefined,
    jobReports: (d) => reports.runWeeklyJobReports(d, { newId, nowIso }),
  });
  await writeStore(data);
  return record;
}

async function tick(): Promise<void> {
  const s = state();
  if (s.running) return; // overlap guard
  s.running = true;
  try {
    const record = await runServerTick({ source: "scheduler" });
    s.lastRecord = record;
    s.lastTickAt = record.finishedAt;
    s.lastError = record.errors.length ? record.errors.join("; ") : null;
    s.tickCount += 1;
    if (record.results.length || record.errors.length) {
      console.log(
        `[bhc scheduler] tick ${s.tickCount}: ${record.results.length} result(s), ${record.errors.length} error(s) in ${record.durationMs}ms`,
      );
    }
  } catch (err) {
    s.lastError = err instanceof Error ? err.message : String(err);
    console.error("[bhc scheduler] tick failed:", s.lastError);
  } finally {
    s.running = false;
  }
}

export function startScheduler(): boolean {
  const s = state();
  if (s.started) return false;
  if (!schedulerEnabled()) {
    console.log("[bhc scheduler] disabled via BHC_SCHEDULER=0");
    return false;
  }
  s.started = true;
  s.startedAt = new Date().toISOString();
  s.intervalMin = schedulerIntervalMinutes();

  const initialDelaySec = Number(process.env.BHC_SCHEDULER_INITIAL_DELAY_SEC ?? "45");
  const initial = setTimeout(
    () => void tick(),
    (Number.isFinite(initialDelaySec) ? Math.max(5, initialDelaySec) : 45) * 1000,
  );
  initial.unref?.();

  s.timer = setInterval(() => void tick(), s.intervalMin * 60_000);
  s.timer.unref?.();
  console.log(`[bhc scheduler] started — every ${s.intervalMin} min`);
  return true;
}

export function stopScheduler(): void {
  const s = state();
  if (s.timer) clearInterval(s.timer);
  s.timer = null;
  s.started = false;
}

export type SchedulerInfo = {
  enabled: boolean;
  started: boolean;
  running: boolean;
  intervalMin: number;
  startedAt: string | null;
  lastTickAt: string | null;
  nextTickAt: string | null;
  tickCount: number;
  lastError: string | null;
  /** True when the last tick is older than 2× the interval (or never ran) */
  stale: boolean;
};

export function schedulerInfo(now = Date.now()): SchedulerInfo {
  const s = state();
  const intervalMs = s.intervalMin * 60_000;
  const last = s.lastTickAt ? new Date(s.lastTickAt).getTime() : null;
  const startedMs = s.startedAt ? new Date(s.startedAt).getTime() : null;
  const stale = s.started
    ? last
      ? now - last > 2 * intervalMs
      : startedMs != null && now - startedMs > 2 * intervalMs
    : true;
  return {
    enabled: schedulerEnabled(),
    started: s.started,
    running: s.running,
    intervalMin: s.intervalMin,
    startedAt: s.startedAt,
    lastTickAt: s.lastTickAt,
    nextTickAt:
      s.started && (last ?? startedMs) != null
        ? new Date((last ?? startedMs)! + intervalMs).toISOString()
        : null,
    tickCount: s.tickCount,
    lastError: s.lastError,
    stale,
  };
}
