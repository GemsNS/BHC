import { catalogEntry } from "./automation-defaults";
import {
  audit,
  isAutomationDue,
  runAutomationDetailed,
} from "./mainframe-automations";
import type { AppData, AutomationTickRecord } from "./types";
import { deliverPendingWebhooks, queueWebhook, webhookBacklog } from "./webhooks";
import { runScheduledWorkflows } from "./workflows";

/**
 * The automation engine: one `tick` runs every due automation, scheduled
 * workflows, and webhook delivery/retry, then records what happened.
 *
 * It is pure over `AppData` except for the injected side effects
 * (`backup`, `fetcher`), so the same function powers:
 *   - the in-process scheduler (src/lib/scheduler.ts)
 *   - POST /api/automation { action: "tick" }
 *   - npm run bhc -- automations tick
 *   - the browser demo (network + backup disabled)
 */

export type TickOptions = {
  source?: AutomationTickRecord["source"];
  /** Run every enabled automation regardless of schedule */
  force?: boolean;
  /** Only run these automation ids (still respects `force`) */
  only?: string[];
  now?: number;
  newId: () => string;
  nowIso: () => string;
  /** Allow outbound webhook delivery (server only) */
  network?: boolean;
  fetcher?: typeof fetch;
  /** Server-side backup hook — returns a label or null when skipped */
  backup?: (force: boolean) => Promise<string | null>;
};

const TICK_HISTORY_CAP = 60;

export async function runAutomationTick(
  data: AppData,
  opts: TickOptions,
): Promise<AutomationTickRecord> {
  const started = opts.now ?? Date.now();
  const startedIso = new Date(started).toISOString();
  const results: string[] = [];
  const errors: string[] = [];
  const counters: AutomationTickRecord["counters"] = {
    automationsRun: 0,
    notificationsCreated: 0,
    tasksCreated: 0,
    sequenceSteps: 0,
    webhooksSent: 0,
    webhooksFailed: 0,
    workflowsRun: 0,
    backupCreated: false,
  };

  const only = opts.only ? new Set(opts.only) : null;

  for (const auto of data.assistantAutomations) {
    if (only && !only.has(auto.id)) continue;
    if (!auto.enabled) continue;
    if (!opts.force && !isAutomationDue(auto, started)) continue;

    try {
      if (auto.action === "store_backup") {
        if (!opts.backup) {
          results.push(`[${auto.name}] skipped — backups need the Node host.`);
          continue;
        }
        const label = await opts.backup(Boolean(opts.force));
        auto.lastRunAt = startedIso;
        counters.automationsRun += 1;
        if (label) {
          counters.backupCreated = true;
          results.push(`[${auto.name}] snapshot ${label}`);
          audit(data, "store_backup", `Backup ${label}`, opts.newId);
        } else {
          results.push(`[${auto.name}] already backed up today.`);
        }
        continue;
      }

      if (auto.action === "webhook_retry") {
        if (!opts.network) {
          results.push(`[${auto.name}] skipped — no network in this context.`);
          continue;
        }
        const backlog = webhookBacklog(data).length;
        const r = await deliverPendingWebhooks(data, opts.nowIso, {
          fetcher: opts.fetcher,
          now: started,
        });
        auto.lastRunAt = startedIso;
        counters.automationsRun += 1;
        counters.webhooksSent += r.sent;
        counters.webhooksFailed += r.failed + r.abandoned;
        if (backlog || r.sent || r.failed || r.abandoned) {
          const line = `Webhooks: ${r.sent} delivered, ${r.failed} will retry, ${r.abandoned} abandoned (backlog was ${backlog}).`;
          results.push(`[${auto.name}] ${line}`);
          audit(data, "webhook_retry", line, opts.newId);
        }
        continue;
      }

      const outcome = runAutomationDetailed(data, auto, opts.newId, started);
      counters.automationsRun += 1;
      counters.notificationsCreated += outcome.notifications;
      counters.tasksCreated += outcome.tasks;
      counters.sequenceSteps += outcome.sequenceSteps;
      results.push(`[${auto.name}] ${outcome.summary}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${auto.name}: ${msg}`);
    }
  }

  // Scheduled workflows (trigger: "scheduled")
  try {
    const runs = runScheduledWorkflows(data, new Date(started));
    counters.workflowsRun += runs.length;
    for (const run of runs) {
      const wf = data.workflows.find((w) => w.id === run.workflowId);
      results.push(`[Workflow] ${wf?.name ?? run.workflowId}: ${run.status} (${run.log.length} step(s))`);
    }
  } catch (err) {
    errors.push(`scheduled workflows: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Flush anything workflows queued during this tick (and any prior backlog)
  if (opts.network) {
    try {
      const r = await deliverPendingWebhooks(data, opts.nowIso, {
        fetcher: opts.fetcher,
        now: started,
      });
      counters.webhooksSent += r.sent;
      counters.webhooksFailed += r.failed + r.abandoned;
    } catch (err) {
      errors.push(`webhook flush: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const finished = Date.now();
  const record: AutomationTickRecord = {
    id: opts.newId(),
    source: opts.source ?? "api",
    startedAt: startedIso,
    finishedAt: new Date(finished).toISOString(),
    durationMs: Math.max(0, finished - started),
    results,
    counters,
    errors,
  };
  data.automationRuns.unshift(record);
  if (data.automationRuns.length > TICK_HISTORY_CAP) {
    data.automationRuns.length = TICK_HISTORY_CAP;
  }

  // Let integrations observe the tick (delivered on the next flush/tick)
  if (data.webhookEndpoints.some((e) => e.enabled && e.events.includes("automation.tick"))) {
    queueWebhook(
      data,
      "automation.tick",
      {
        tickId: record.id,
        source: record.source,
        counters,
        results: results.slice(0, 20),
        errors,
      },
      opts.newId,
      opts.nowIso,
    );
  }

  return record;
}

export type AutomationStatus = {
  lastTick: AutomationTickRecord | null;
  ticksToday: number;
  automations: Array<{
    id: string;
    name: string;
    action: string;
    enabled: boolean;
    schedule: string;
    lastRunAt: string | null;
    due: boolean;
  }>;
  dueCount: number;
  webhookBacklog: number;
  unreadNotifications: number;
  scheduledWorkflows: number;
  recentErrors: string[];
};

export function describeSchedule(auto: AppData["assistantAutomations"][number]): string {
  const interval = auto.intervalMinutes ?? catalogEntry(auto.action)?.intervalMinutes;
  if (interval && interval > 0) {
    return interval % 60 === 0 ? `every ${interval / 60}h` : `every ${interval} min`;
  }
  const h = auto.runHour;
  const label = h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
  return `daily from ${label}`;
}

export function automationStatus(data: AppData, now = Date.now()): AutomationStatus {
  const todayKey = new Date(now).toDateString();
  const automations = data.assistantAutomations.map((a) => ({
    id: a.id,
    name: a.name,
    action: a.action,
    enabled: a.enabled,
    schedule: describeSchedule(a),
    lastRunAt: a.lastRunAt,
    due: isAutomationDue(a, now),
  }));
  return {
    lastTick: data.automationRuns[0] ?? null,
    ticksToday: data.automationRuns.filter(
      (r) => new Date(r.startedAt).toDateString() === todayKey,
    ).length,
    automations,
    dueCount: automations.filter((a) => a.due).length,
    webhookBacklog: webhookBacklog(data).length,
    unreadNotifications: data.notifications.filter((n) => !n.readAt).length,
    scheduledWorkflows: data.workflows.filter((w) => w.enabled && w.trigger === "scheduled").length,
    recentErrors: data.automationRuns.slice(0, 5).flatMap((r) => r.errors),
  };
}
