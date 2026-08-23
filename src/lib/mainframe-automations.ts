import { huntLeadsFromCriteria } from "./mainframe-prospects";
import type { AppData, AssistantDailyAutomation } from "./types";
import { processSequenceSteps } from "./workflows";

export type AutomationRunResult = {
  automation: AssistantDailyAutomation;
  summary: string;
};

function audit(data: AppData, action: string, detail: string, newId: () => string) {
  data.assistantAudit.unshift({
    id: newId(),
    action,
    detail,
    createdAt: new Date().toISOString(),
  });
  if (data.assistantAudit.length > 100) data.assistantAudit.length = 100;
}

function runPipelineScan(data: AppData, newId: () => string): string {
  const staleDays = 3;
  const cutoff = Date.now() - staleDays * 86400000;
  let tasks = 0;
  for (const lead of data.leads) {
    if (lead.status !== "new" && lead.status !== "contacted") continue;
    if (new Date(lead.updatedAt).getTime() > cutoff) continue;
    data.activities.unshift({
      id: newId(),
      type: "task",
      subject: `Mainframe: follow up ${lead.name}`,
      body: `Lead stale ${staleDays}+ days — first contact or qualify.`,
      relatedType: "lead",
      relatedId: lead.id,
      authorId: "emp-admin",
      dueAt: new Date().toISOString(),
      completedAt: null,
      createdAt: new Date().toISOString(),
    });
    tasks += 1;
  }
  const msg = `Pipeline scan: ${tasks} follow-up task(s) created for stale leads.`;
  audit(data, "pipeline_scan", msg, newId);
  return msg;
}

function runProspectHunt(data: AppData, newId: () => string): string {
  const { matchedLeads, queued, notes } = huntLeadsFromCriteria(data);
  const msg = `Prospect hunt: ${queued} outreach draft(s) queued (${matchedLeads.length} leads matched). ${notes.join(" ")}`;
  audit(data, "prospect_hunt", msg, newId);
  return msg;
}

function runOutreachDigest(data: AppData, newId: () => string): string {
  const pending = data.outreachQueue.filter((o) => o.status === "pending_approval");
  const msg = `Outreach digest: ${pending.length} draft(s) awaiting your approval before send.`;
  audit(data, "outreach_digest", msg, newId);
  return msg;
}

function runSequences(data: AppData, newId: () => string): string {
  const n = processSequenceSteps(data);
  const msg = `Processed ${n} due sequence step(s).`;
  audit(data, "process_sequences", msg, newId);
  return msg;
}

export function runAutomation(
  data: AppData,
  automation: AssistantDailyAutomation,
  newId: () => string,
): string {
  let summary: string;
  switch (automation.action) {
    case "pipeline_scan":
      summary = runPipelineScan(data, newId);
      break;
    case "prospect_hunt":
      summary = runProspectHunt(data, newId);
      break;
    case "outreach_digest":
      summary = runOutreachDigest(data, newId);
      break;
    case "process_sequences":
      summary = runSequences(data, newId);
      break;
    default:
      summary = "Unknown automation action.";
  }
  automation.lastRunAt = new Date().toISOString();
  return summary;
}

export function runDailyAutomations(
  data: AppData,
  newId: () => string,
  opts?: { force?: boolean },
): string[] {
  const hour = new Date().getHours();
  const results: string[] = [];
  for (const auto of data.assistantAutomations) {
    if (!auto.enabled) continue;
    const due =
      opts?.force ||
      auto.runHour === hour ||
      !auto.lastRunAt ||
      new Date(auto.lastRunAt).toDateString() !== new Date().toDateString();
    if (!due) continue;
    results.push(`[${auto.name}] ${runAutomation(data, auto, newId)}`);
  }
  return results;
}

export function automationsDue(data: AppData): AssistantDailyAutomation[] {
  const hour = new Date().getHours();
  return data.assistantAutomations.filter((a) => {
    if (!a.enabled) return false;
    if (a.lastRunAt && new Date(a.lastRunAt).toDateString() === new Date().toDateString()) {
      return false;
    }
    return a.runHour <= hour;
  });
}
