import { findProspectsForLead, scoreLead } from "./lead-automation";
import type {
  AppData,
  Lead,
  Shift,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowTrigger,
} from "./types";

export type WorkflowContext = {
  leadId?: string;
  shiftId?: string;
  leadStatus?: string;
  authorId?: string;
};

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function logRun(
  data: AppData,
  wf: WorkflowDefinition,
  trigger: WorkflowTrigger,
  context: WorkflowContext,
  log: string[],
  status: WorkflowRun["status"],
): WorkflowRun {
  const run: WorkflowRun = {
    id: `wfr-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    workflowId: wf.id,
    trigger,
    context: Object.fromEntries(
      Object.entries(context).filter(([, v]) => v != null),
    ) as Record<string, string>,
    status,
    log,
    createdAt: new Date().toISOString(),
  };
  data.workflowRuns.unshift(run);
  if (data.workflowRuns.length > 200) {
    data.workflowRuns.length = 200;
  }
  return run;
}

function matchingWorkflows(
  data: AppData,
  trigger: WorkflowTrigger,
  context: WorkflowContext,
): WorkflowDefinition[] {
  return data.workflows.filter((wf) => {
    if (!wf.enabled || wf.trigger !== trigger) return false;
    if (trigger === "lead_status_changed") {
      const want = wf.triggerConfig.status;
      return !want || want === context.leadStatus;
    }
    return true;
  });
}

function executeAction(
  data: AppData,
  wf: WorkflowDefinition,
  action: WorkflowDefinition["actions"][number],
  context: WorkflowContext,
  log: string[],
  runId: string,
): boolean {
  const lead = context.leadId
    ? data.leads.find((l) => l.id === context.leadId)
    : undefined;
  const shift = context.shiftId
    ? data.shifts.find((s) => s.id === context.shiftId)
    : undefined;
  const stamp = new Date().toISOString();
  const authorId = context.authorId ?? "emp-admin";

  switch (action.type) {
    case "assign_lead": {
      if (!lead) return false;
      const assignee = String(action.config.assigneeId ?? "emp-sales-1");
      lead.assignedToId = assignee;
      lead.updatedAt = stamp;
      log.push(`Assigned lead ${lead.id} to ${assignee}`);
      return true;
    }
    case "create_task": {
      const subject = String(action.config.subject ?? "Follow up");
      const dueDays = Number(action.config.dueDays ?? 1);
      const relatedId = lead?.id ?? shift?.id ?? "general";
      const relatedType = lead ? "lead" : shift ? "job" : "lead";
      data.activities.unshift({
        id: `act-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        type: "task",
        subject,
        body: `Auto-created by workflow "${wf.name}"`,
        relatedType: relatedType as "lead" | "job",
        relatedId,
        authorId,
        dueAt: addDays(stamp, dueDays),
        completedAt: null,
        createdAt: stamp,
      });
      log.push(`Created task: ${subject}`);
      return true;
    }
    case "enroll_sequence": {
      if (!lead) return false;
      const sequenceId = String(action.config.sequenceId ?? "");
      const seq = data.sequences.find((s) => s.id === sequenceId && s.enabled);
      if (!seq) {
        log.push(`Sequence ${sequenceId} not found or disabled`);
        return false;
      }
      const exists = data.sequenceEnrollments.some(
        (e) => e.leadId === lead.id && e.sequenceId === sequenceId && e.status === "active",
      );
      if (exists) {
        log.push(`Lead already enrolled in ${seq.name}`);
        return true;
      }
      data.sequenceEnrollments.unshift({
        id: `enr-${Date.now()}`,
        sequenceId,
        leadId: lead.id,
        currentStepIndex: 0,
        status: "active",
        enrolledAt: stamp,
        nextRunAt: stamp,
      });
      log.push(`Enrolled lead in sequence "${seq.name}"`);
      return true;
    }
    case "find_prospects": {
      if (!lead) return false;
      const limit = Number(action.config.limit ?? 3);
      const prospects = findProspectsForLead(data, lead, limit);
      log.push(`Found ${prospects.length} prospect(s) for lead ${lead.name}`);
      for (const p of prospects) {
        data.outreachQueue.unshift({
          ...p,
          id: `out-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          status: "pending_approval",
          workflowRunId: runId,
          sentAt: null,
          createdAt: stamp,
        });
      }
      return true;
    }
    case "queue_outreach": {
      log.push("Outreach items queued for approval");
      return true;
    }
    case "log_email": {
      if (!lead) return false;
      const subject = String(action.config.subject ?? "Automated follow-up");
      data.activities.unshift({
        id: `act-${Date.now()}`,
        type: "email",
        subject,
        body: String(action.config.body ?? "Sent via workflow automation (demo log)."),
        relatedType: "lead",
        relatedId: lead.id,
        authorId,
        dueAt: null,
        completedAt: stamp,
        createdAt: stamp,
      });
      log.push(`Logged email: ${subject}`);
      return true;
    }
    case "create_ticket": {
      if (!lead) return false;
      data.tickets.unshift({
        id: `tkt-${Date.now()}`,
        subject: String(action.config.subject ?? `Follow-up: ${lead.name}`),
        description: String(action.config.description ?? lead.notes),
        status: "new",
        priority: "medium",
        contactName: lead.name,
        contactEmail: lead.email,
        assigneeId: null,
        leadId: lead.id,
        companyId: lead.companyId,
        createdAt: stamp,
        updatedAt: stamp,
      });
      log.push("Created support ticket");
      return true;
    }
    case "notify": {
      const msg = String(action.config.message ?? "Workflow notification");
      data.announcements.unshift({
        id: `ann-${Date.now()}`,
        title: wf.name,
        body: msg,
        authorId,
        pinned: false,
        audienceRoles: [],
        createdAt: stamp,
      });
      log.push(`Posted announcement: ${msg}`);
      return true;
    }
    default:
      log.push(`Unknown action type: ${action.type}`);
      return false;
  }
}

export function runSingleWorkflow(
  data: AppData,
  workflowId: string,
  context: WorkflowContext,
): WorkflowRun[] {
  const wf = data.workflows.find((w) => w.id === workflowId);
  if (!wf || !wf.enabled) return [];

  const log: string[] = [];
  let ok = 0;
  const run = logRun(data, wf, wf.trigger, context, [], "completed");
  for (const action of wf.actions) {
    if (executeAction(data, wf, action, context, log, run.id)) ok += 1;
  }
  run.log = log;
  run.status =
    ok === wf.actions.length ? "completed" : ok > 0 ? "partial" : "failed";
  return [run];
}

export function runWorkflows(
  data: AppData,
  trigger: WorkflowTrigger,
  context: WorkflowContext,
): WorkflowRun[] {
  const runs: WorkflowRun[] = [];
  for (const wf of matchingWorkflows(data, trigger, context)) {
    const log: string[] = [];
    let ok = 0;
    const run = logRun(data, wf, trigger, context, [], "completed");
    for (const action of wf.actions) {
      if (executeAction(data, wf, action, context, log, run.id)) ok += 1;
    }
    run.log = log;
    run.status =
      ok === wf.actions.length
        ? "completed"
        : ok > 0
          ? "partial"
          : "failed";
    runs.push(run);
  }
  return runs;
}

export function onLeadCreated(data: AppData, lead: Lead, authorId?: string): WorkflowRun[] {
  lead.leadScore = scoreLead(lead);
  return runWorkflows(data, "lead_created", { leadId: lead.id, authorId });
}

export function onLeadStatusChanged(
  data: AppData,
  lead: Lead,
  authorId?: string,
): WorkflowRun[] {
  lead.leadScore = scoreLead(lead);
  return runWorkflows(data, "lead_status_changed", {
    leadId: lead.id,
    leadStatus: lead.status,
    authorId,
  });
}

export function onShiftPostedPool(
  data: AppData,
  shift: Shift,
  authorId?: string,
): WorkflowRun[] {
  return runWorkflows(data, "shift_posted_pool", {
    shiftId: shift.id,
    authorId,
  });
}

/** Process due sequence steps — demo: log email/call activities */
export function processSequenceSteps(data: AppData): number {
  const now = Date.now();
  let processed = 0;
  for (const enrollment of data.sequenceEnrollments) {
    if (enrollment.status !== "active" || !enrollment.nextRunAt) continue;
    if (new Date(enrollment.nextRunAt).getTime() > now) continue;

    const seq = data.sequences.find((s) => s.id === enrollment.sequenceId);
    const lead = data.leads.find((l) => l.id === enrollment.leadId);
    if (!seq || !lead) continue;

    const step = seq.steps[enrollment.currentStepIndex];
    if (!step) {
      enrollment.status = "completed";
      enrollment.nextRunAt = null;
      continue;
    }

    const stamp = new Date().toISOString();
    data.activities.unshift({
      id: `act-seq-${Date.now()}-${processed}`,
      type: step.type === "task" ? "task" : step.type === "call" ? "call" : "email",
      subject: step.subject,
      body: step.body,
      relatedType: "lead",
      relatedId: lead.id,
      authorId: "emp-sales-1",
      dueAt: step.type === "task" ? addDays(stamp, step.delayDays) : null,
      completedAt: step.type !== "task" ? stamp : null,
      createdAt: stamp,
    });

    enrollment.currentStepIndex += 1;
    if (enrollment.currentStepIndex >= seq.steps.length) {
      enrollment.status = "completed";
      enrollment.nextRunAt = null;
    } else {
      const next = seq.steps[enrollment.currentStepIndex];
      enrollment.nextRunAt = addDays(stamp, next?.delayDays ?? 1);
    }
    processed += 1;
  }
  return processed;
}
