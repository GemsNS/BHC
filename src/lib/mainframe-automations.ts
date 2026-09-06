import {
  checkDamage,
  checkFleet,
  checkInventory,
  checkInvoices,
  checkJobHealth,
  checkTaskReminders,
  checkToolCheckouts,
  runDailyDigest,
  type CheckResult,
} from "./automation-checks";
import { catalogEntry } from "./automation-defaults";
import { huntLeadsFromCriteria } from "./mainframe-prospects";
import { queueFollowUps } from "./outreach-send";
import { runCustomerTouches } from "./customer-touches";
import type { AppData, AssistantDailyAutomation } from "./types";
import { processSequenceSteps } from "./workflows";

export type AutomationRunResult = {
  automation: AssistantDailyAutomation;
  summary: string;
};

/** Structured outcome of one automation so the engine can aggregate counters */
export type AutomationOutcome = {
  summary: string;
  notifications: number;
  tasks: number;
  sequenceSteps: number;
  /** True when the action must be completed by the server-side engine */
  deferred: boolean;
};

export function audit(data: AppData, action: string, detail: string, newId: () => string) {
  data.assistantAudit.unshift({
    id: newId(),
    action,
    detail,
    createdAt: new Date().toISOString(),
  });
  if (data.assistantAudit.length > 100) data.assistantAudit.length = 100;
}

function runPipelineScan(data: AppData, newId: () => string): AutomationOutcome {
  const staleDays = 3;
  const cutoff = Date.now() - staleDays * 86400000;
  let tasks = 0;
  for (const lead of data.leads) {
    if (lead.status !== "new" && lead.status !== "contacted") continue;
    if (new Date(lead.updatedAt).getTime() > cutoff) continue;
    const subject = `Mainframe: follow up ${lead.name}`;
    const exists = data.activities.some(
      (a) => a.type === "task" && !a.completedAt && a.relatedId === lead.id && a.subject === subject,
    );
    if (exists) continue;
    data.activities.unshift({
      id: newId(),
      type: "task",
      subject,
      body: `Lead stale ${staleDays}+ days — first contact or qualify.`,
      relatedType: "lead",
      relatedId: lead.id,
      authorId: lead.assignedToId ?? "emp-admin",
      dueAt: new Date().toISOString(),
      completedAt: null,
      createdAt: new Date().toISOString(),
    });
    tasks += 1;
  }
  const summary = `Pipeline scan: ${tasks} follow-up task(s) created for stale leads.`;
  audit(data, "pipeline_scan", summary, newId);
  return { summary, notifications: 0, tasks, sequenceSteps: 0, deferred: false };
}

function runProspectHunt(data: AppData, newId: () => string): AutomationOutcome {
  const { matchedLeads, queued, notes } = huntLeadsFromCriteria(data);
  const summary = `Prospect hunt: ${queued} outreach draft(s) queued (${matchedLeads.length} leads matched). ${notes.join(" ")}`;
  audit(data, "prospect_hunt", summary, newId);
  return { summary, notifications: 0, tasks: 0, sequenceSteps: 0, deferred: false };
}

function runOutreachDigest(data: AppData, newId: () => string): AutomationOutcome {
  const pending = data.outreachQueue.filter((o) => o.status === "pending_approval");
  const summary = `Outreach digest: ${pending.length} draft(s) awaiting your approval before send.`;
  audit(data, "outreach_digest", summary, newId);
  return { summary, notifications: 0, tasks: 0, sequenceSteps: 0, deferred: false };
}

function runSequences(data: AppData, newId: () => string): AutomationOutcome {
  const n = processSequenceSteps(data);
  const summary = `Processed ${n} due sequence step(s).`;
  audit(data, "process_sequences", summary, newId);
  return { summary, notifications: 0, tasks: 0, sequenceSteps: n, deferred: false };
}

function fromCheck(
  data: AppData,
  action: string,
  result: CheckResult,
  newId: () => string,
): AutomationOutcome {
  audit(data, action, result.summary, newId);
  return {
    summary: result.summary,
    notifications: result.notifications,
    tasks: result.tasks,
    sequenceSteps: 0,
    deferred: false,
  };
}

/** Run one automation's synchronous work. Server-only actions return `deferred`. */
export function runAutomationDetailed(
  data: AppData,
  automation: AssistantDailyAutomation,
  newId: () => string,
  now = Date.now(),
): AutomationOutcome {
  const ctx = { newId, nowIso: () => new Date(now).toISOString(), now };
  let outcome: AutomationOutcome;
  switch (automation.action) {
    case "pipeline_scan":
      outcome = runPipelineScan(data, newId);
      break;
    case "prospect_hunt":
      outcome = runProspectHunt(data, newId);
      break;
    case "outreach_digest":
      outcome = runOutreachDigest(data, newId);
      break;
    case "process_sequences":
      outcome = runSequences(data, newId);
      break;
    case "task_reminders":
      outcome = fromCheck(data, automation.action, checkTaskReminders(data, ctx), newId);
      break;
    case "invoice_followup":
      outcome = fromCheck(data, automation.action, checkInvoices(data, ctx), newId);
      break;
    case "job_health":
      outcome = fromCheck(data, automation.action, checkJobHealth(data, ctx), newId);
      break;
    case "inventory_reorder":
      outcome = fromCheck(data, automation.action, checkInventory(data, ctx), newId);
      break;
    case "tool_overdue":
      outcome = fromCheck(data, automation.action, checkToolCheckouts(data, ctx), newId);
      break;
    case "damage_escalation":
      outcome = fromCheck(data, automation.action, checkDamage(data, ctx), newId);
      break;
    case "fleet_check":
      outcome = fromCheck(data, automation.action, checkFleet(data, ctx), newId);
      break;
    case "daily_digest":
      outcome = fromCheck(data, automation.action, runDailyDigest(data, ctx), newId);
      break;
    case "outreach_followup": {
      const r = queueFollowUps(data, ctx);
      audit(data, automation.action, r.summary, newId);
      outcome = { summary: r.summary, notifications: 0, tasks: 0, sequenceSteps: 0, deferred: false };
      break;
    }
    case "review_requests":
    case "referral_asks":
    case "payment_reminders": {
      const r = runCustomerTouches(data, automation.action, ctx);
      audit(data, automation.action, r.summary, newId);
      outcome = { summary: r.summary, notifications: 0, tasks: 0, sequenceSteps: 0, deferred: false };
      break;
    }
    case "webhook_retry":
    case "store_backup":
    case "ad_ingest":
    case "outreach_send":
    case "media_offload":
    case "lead_discovery":
    case "job_reports":
      outcome = {
        summary: `${automation.name}: requires the server automation engine (npm run bhc -- automations tick, or the built-in scheduler).`,
        notifications: 0,
        tasks: 0,
        sequenceSteps: 0,
        deferred: true,
      };
      break;
    default:
      outcome = {
        summary: "Unknown automation action.",
        notifications: 0,
        tasks: 0,
        sequenceSteps: 0,
        deferred: false,
      };
  }
  if (!outcome.deferred) automation.lastRunAt = new Date(now).toISOString();
  return outcome;
}

/** Backwards-compatible string API used by the CLI and /api/assistant */
export function runAutomation(
  data: AppData,
  automation: AssistantDailyAutomation,
  newId: () => string,
): string {
  return runAutomationDetailed(data, automation, newId).summary;
}

function sameDay(a: string, nowMs: number): boolean {
  return new Date(a).toDateString() === new Date(nowMs).toDateString();
}

/**
 * Is this automation due right now?
 * - interval automations: due when `intervalMinutes` have elapsed since last run
 * - daily automations: due when the hour has been reached and it has not run today
 */
export function isAutomationDue(auto: AssistantDailyAutomation, nowMs = Date.now()): boolean {
  if (!auto.enabled) return false;
  const interval = auto.intervalMinutes ?? catalogEntry(auto.action)?.intervalMinutes;
  if (interval && interval > 0) {
    if (!auto.lastRunAt) return true;
    return nowMs - new Date(auto.lastRunAt).getTime() >= interval * 60_000;
  }
  if (auto.lastRunAt && sameDay(auto.lastRunAt, nowMs)) return false;
  return new Date(nowMs).getHours() >= auto.runHour;
}

export function runDailyAutomations(
  data: AppData,
  newId: () => string,
  opts?: { force?: boolean; now?: number },
): string[] {
  const now = opts?.now ?? Date.now();
  const results: string[] = [];
  for (const auto of data.assistantAutomations) {
    if (!auto.enabled) continue;
    if (!opts?.force && !isAutomationDue(auto, now)) continue;
    results.push(`[${auto.name}] ${runAutomationDetailed(data, auto, newId, now).summary}`);
  }
  return results;
}

export function automationsDue(data: AppData, nowMs = Date.now()): AssistantDailyAutomation[] {
  return data.assistantAutomations.filter((a) => isAutomationDue(a, nowMs));
}
