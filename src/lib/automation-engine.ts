import { runAdIngest, type AdPipelineHooks } from "./ad-pipeline";
import { catalogEntry } from "./automation-defaults";
import { live } from "./events";
import {
  audit,
  isAutomationDue,
  runAutomationDetailed,
} from "./mainframe-automations";
import { processOutreachQueue, type Senders } from "./outreach-send";
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
  /** Job-ad pipeline I/O (RSS fetcher, IMAP poller, AI on/off). Omit to skip ad_ingest. */
  ads?: Pick<AdPipelineHooks, "fetcher" | "pollImap" | "ai" | "classifyLimit">;
  /** Real email/SMS senders. Omit to skip outreach_send. */
  senders?: Senders;
  /** Server hook: move inline photos to disk. Omit to skip media_offload. */
  offloadMedia?: (data: AppData) => Promise<{ moved: number; remaining: number }>;
  /** Server hook: web lead discovery (Claude + web search). Omit to skip lead_discovery. */
  discover?: (data: AppData) => Promise<{ summary: string; created: number; errors: string[] }>;
  /** Server hook: weekly customer PDF reports. Omit to skip job_reports. */
  jobReports?: (data: AppData) => Promise<{ generated: number; sent: number; summary: string }>;
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
  live.tick(`Engine tick started`, `${opts.force ? "forced · " : ""}${opts.source ?? "api"}`, opts.source);
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

      if (auto.action === "ad_ingest") {
        if (!opts.ads) {
          results.push(`[${auto.name}] skipped — runs on the Node host (RSS/IMAP polling).`);
          continue;
        }
        const r = await runAdIngest(data, {
          ...opts.ads,
          newId: opts.newId,
          nowIso: opts.nowIso,
          now: started,
        });
        const { purgeSyntheticOutreachAndAds } = await import("./outreach-guard");
        const purged = purgeSyntheticOutreachAndAds(data);
        auto.lastRunAt = startedIso;
        counters.automationsRun += 1;
        counters.tasksCreated += 0;
        const purgeNote =
          purged.removedAds || purged.removedLeads || purged.cancelledOutreach
            ? ` · purged ${purged.removedAds} junk ad(s), ${purged.removedLeads} fake lead(s), ${purged.cancelledOutreach} draft(s)`
            : "";
        results.push(`[${auto.name}] ${r.summary}${purgeNote}`);
        for (const e of r.errors) errors.push(`${auto.name}: ${e}`);
        if (r.created || r.qualified || purged.removedAds || purged.removedLeads) {
          audit(data, "ad_ingest", `${r.summary}${purgeNote}`, opts.newId);
        }
        continue;
      }

      if (auto.action === "media_offload") {
        if (!opts.offloadMedia) {
          results.push(`[${auto.name}] skipped — runs on the Node host.`);
          continue;
        }
        const r = await opts.offloadMedia(data);
        auto.lastRunAt = startedIso;
        counters.automationsRun += 1;
        if (r.moved || r.remaining) {
          const line = `Photo storage: ${r.moved} file(s) moved to disk${r.remaining ? `, ${r.remaining} left for next run` : ""}.`;
          results.push(`[${auto.name}] ${line}`);
          audit(data, "media_offload", line, opts.newId);
          live.automation("Photo storage housekeeping", line);
        }
        continue;
      }

      if (auto.action === "job_reports") {
        if (!opts.jobReports) {
          results.push(`[${auto.name}] skipped — runs on the Node host.`);
          continue;
        }
        // Only on the configured weekday (default Friday) unless forced
        const weekday = Number(process.env.JOB_REPORT_WEEKDAY ?? "5");
        if (!opts.force && new Date(started).getDay() !== weekday) continue;
        const r = await opts.jobReports(data);
        auto.lastRunAt = startedIso;
        counters.automationsRun += 1;
        if (r.generated) {
          results.push(`[${auto.name}] ${r.summary}`);
          audit(data, "job_reports", r.summary, opts.newId);
        }
        continue;
      }

      if (auto.action === "lead_discovery") {
        if (!opts.discover) {
          results.push(`[${auto.name}] skipped — needs the Node host + ANTHROPIC_API_KEY.`);
          continue;
        }
        const r = await opts.discover(data);
        auto.lastRunAt = startedIso;
        counters.automationsRun += 1;
        results.push(`[${auto.name}] ${r.summary}`);
        for (const e of r.errors) errors.push(`${auto.name}: ${e}`);
        if (r.created) audit(data, "lead_discovery", r.summary, opts.newId);
        continue;
      }

      if (auto.action === "outreach_send") {
        if (!opts.senders) {
          results.push(`[${auto.name}] skipped — sending needs the Node host (SMTP/Twilio).`);
          continue;
        }
        const r = await processOutreachQueue(data, { newId: opts.newId, nowIso: opts.nowIso, now: started }, opts.senders);
        auto.lastRunAt = startedIso;
        counters.automationsRun += 1;
        if (r.sent || r.failed) {
          results.push(`[${auto.name}] ${r.summary}`);
          audit(data, "outreach_send", r.summary, opts.newId);
        }
        continue;
      }

      const outcome = runAutomationDetailed(data, auto, opts.newId, started);
      counters.automationsRun += 1;
      counters.notificationsCreated += outcome.notifications;
      counters.tasksCreated += outcome.tasks;
      counters.sequenceSteps += outcome.sequenceSteps;
      results.push(`[${auto.name}] ${outcome.summary}`);

      // Daily digest → email the owner when a mailbox is configured (DIGEST_EMAIL_TO)
      if (auto.action === "daily_digest" && outcome.notifications > 0 && opts.senders?.email) {
        const to = typeof process !== "undefined" ? process.env?.DIGEST_EMAIL_TO?.trim() : "";
        if (to) {
          const pending = data.outreachQueue.filter((o) => o.status === "pending_approval");
          const newAds = data.adListings.filter((a) => a.status === "new").length;
          const replied = data.adListings.filter((a) => a.status === "replied").length;
          const unread = data.notifications.filter((n) => !n.readAt).slice(0, 12);
          const text = [
            outcome.summary.replace(/^Daily digest: /, ""),
            "",
            `Job ads: ${newAds} new · ${pending.length} repl${pending.length === 1 ? "y" : "ies"} awaiting approval · ${replied} prospect${replied === 1 ? "" : "s"} replied`,
            "",
            unread.length ? "Open alerts:" : "No open alerts.",
            ...unread.map((n) => `• ${n.title} — ${n.body}`),
            "",
            "Approve replies: /admin/ads · Automation hub: /admin/automation",
          ].join("\n");
          try {
            const r = await opts.senders.email({ to, subject: `BHC daily digest — ${new Date(started).toLocaleDateString()}`, text });
            results.push(r.ok ? `[Daily ops digest] emailed to ${to}` : `[Daily ops digest] email failed: ${r.error}`);
          } catch (err) {
            errors.push(`digest email: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
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
  for (const line of results) {
    if (/ skipped |: 0 [a-z]|Processed 0 |: 0 collection|: 0 alert|Fleet: 0|0 report\(s\)|0 item\(s\) at|0 overdue|0 reminder\(s\) sent|0 draft\(s\)|0 source\(s\) polled · 0 new/.test(line) && !/error/i.test(line)) continue;
    live.automation(line.replace(/^\[[^\]]+\]\s*/, "").slice(0, 160), line.match(/^\[([^\]]+)\]/)?.[1]);
  }
  for (const e of errors) live.error("automation", e.slice(0, 160));
  live.tick(
    `Engine tick done in ${record.durationMs} ms`,
    `${counters.automationsRun} automation(s) · ${counters.notificationsCreated} alert(s) · ${counters.tasksCreated} task(s) · webhooks ${counters.webhooksSent}/${counters.webhooksFailed}${errors.length ? ` · ${errors.length} error(s)` : ""}`,
    opts.source,
  );

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
