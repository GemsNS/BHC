import { findProspectsForLead, scoreLead } from "./lead-automation";
import { enqueueNotification } from "./notifications";
import { queueWebhook } from "./webhooks";
import type {
  AppData,
  DamageReport,
  InvoiceDoc,
  Job,
  KnockProposal,
  Lead,
  LeadStatus,
  ServiceTicket,
  Shift,
  WebhookEventName,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowTrigger,
} from "./types";

export type WorkflowContext = {
  leadId?: string;
  shiftId?: string;
  jobId?: string;
  invoiceId?: string;
  proposalId?: string;
  damageReportId?: string;
  ticketId?: string;
  leadStatus?: string;
  jobStatus?: string;
  invoiceStatus?: string;
  severity?: string;
  authorId?: string;
};

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function rid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

/** Local calendar day key (YYYY-MM-DD in server-local time) */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function logRun(
  data: AppData,
  wf: WorkflowDefinition,
  trigger: WorkflowTrigger,
  context: WorkflowContext,
  log: string[],
  status: WorkflowRun["status"],
  createdAt = new Date().toISOString(),
): WorkflowRun {
  const run: WorkflowRun = {
    id: rid("wfr"),
    workflowId: wf.id,
    trigger,
    context: Object.fromEntries(
      Object.entries(context).filter(([, v]) => v != null),
    ) as Record<string, string>,
    status,
    log,
    createdAt,
  };
  data.workflowRuns.unshift(run);
  if (data.workflowRuns.length > 200) {
    data.workflowRuns.length = 200;
  }
  return run;
}

/** Does this workflow's trigger filter accept the event context? */
export function workflowMatches(
  wf: WorkflowDefinition,
  trigger: WorkflowTrigger,
  context: WorkflowContext,
): boolean {
  if (!wf.enabled || wf.trigger !== trigger) return false;
  const cfg = wf.triggerConfig ?? {};
  switch (trigger) {
    case "lead_status_changed":
      return !cfg.status || cfg.status === context.leadStatus;
    case "job_status_changed":
      return !cfg.status || cfg.status === context.jobStatus;
    case "invoice_status_changed":
      return !cfg.status || cfg.status === context.invoiceStatus;
    case "damage_reported":
      return !cfg.severity || cfg.severity === context.severity;
    default:
      return true;
  }
}

function matchingWorkflows(
  data: AppData,
  trigger: WorkflowTrigger,
  context: WorkflowContext,
): WorkflowDefinition[] {
  return data.workflows.filter((wf) => workflowMatches(wf, trigger, context));
}

type Subjects = {
  lead?: Lead;
  shift?: Shift;
  job?: Job;
  invoice?: InvoiceDoc;
  proposal?: KnockProposal;
  damage?: DamageReport;
  ticket?: ServiceTicket;
};

function resolveSubjects(data: AppData, context: WorkflowContext): Subjects {
  const lead = context.leadId ? data.leads.find((l) => l.id === context.leadId) : undefined;
  const job = context.jobId ? data.jobs.find((j) => j.id === context.jobId) : undefined;
  const invoice = context.invoiceId
    ? data.invoices.find((i) => i.id === context.invoiceId)
    : undefined;
  const proposal = context.proposalId
    ? data.knockProposals.find((p) => p.id === context.proposalId)
    : undefined;
  return {
    lead: lead ?? (job?.leadId ? data.leads.find((l) => l.id === job.leadId) : undefined),
    shift: context.shiftId ? data.shifts.find((s) => s.id === context.shiftId) : undefined,
    job: job ?? (invoice ? data.jobs.find((j) => j.id === invoice.jobId) : undefined),
    invoice,
    proposal,
    damage: context.damageReportId
      ? data.damageReports.find((d) => d.id === context.damageReportId)
      : undefined,
    ticket: context.ticketId ? data.tickets.find((t) => t.id === context.ticketId) : undefined,
  };
}

/** Best related record for tasks/notifications, in priority order. */
function primaryRelated(
  s: Subjects,
): { relatedType: "lead" | "job" | "ticket"; relatedId: string; label: string } | null {
  if (s.lead) return { relatedType: "lead", relatedId: s.lead.id, label: s.lead.name };
  if (s.job) return { relatedType: "job", relatedId: s.job.id, label: s.job.title };
  if (s.ticket) return { relatedType: "ticket", relatedId: s.ticket.id, label: s.ticket.subject };
  if (s.shift) return { relatedType: "job", relatedId: s.shift.id, label: s.shift.title };
  return null;
}

function webhookEventForTrigger(trigger: WorkflowTrigger): WebhookEventName {
  switch (trigger) {
    case "lead_created":
      return "lead.created";
    case "lead_status_changed":
      return "lead.status_changed";
    case "job_created":
      return "job.created";
    case "job_status_changed":
      return "job.status_changed";
    case "invoice_status_changed":
      return "invoice.status_changed";
    case "proposal_signed":
      return "proposal.signed";
    case "damage_reported":
      return "damage.reported";
    case "ticket_created":
      return "ticket.created";
    default:
      return "workflow.ran";
  }
}

function executeAction(
  data: AppData,
  wf: WorkflowDefinition,
  action: WorkflowDefinition["actions"][number],
  context: WorkflowContext,
  log: string[],
  runId: string,
): boolean {
  const s = resolveSubjects(data, context);
  const { lead, job } = s;
  const stamp = new Date().toISOString();
  const authorId = context.authorId ?? "emp-admin";
  const related = primaryRelated(s);

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
      const relatedId = related?.relatedId ?? "general";
      const relatedType = related?.relatedType ?? "lead";
      data.activities.unshift({
        id: rid("act"),
        type: "task",
        subject: related ? `${subject}: ${related.label}` : subject,
        body: `Auto-created by workflow "${wf.name}"`,
        relatedType,
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
      const seq = data.sequences.find((x) => x.id === sequenceId && x.enabled);
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
        id: rid("enr"),
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
          id: rid("out"),
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
        id: rid("act"),
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
        id: rid("tkt"),
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
        id: rid("ann"),
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
    case "create_notification": {
      const title = String(action.config.title ?? wf.name);
      const detail = related ? related.label : s.damage?.targetLabel ?? "";
      const body = String(action.config.body ?? "") || detail || wf.description;
      const target =
        action.config.employeeId === "assignee"
          ? lead?.assignedToId ?? job?.crewLeadId ?? null
          : action.config.employeeId
            ? String(action.config.employeeId)
            : null;
      enqueueNotification(
        data,
        {
          employeeId: target,
          title,
          body,
          href: action.config.href ? String(action.config.href) : null,
          dedupeKey: `wf:${wf.id}:${related?.relatedId ?? s.damage?.id ?? runId}`,
        },
        () => rid("ntf"),
        () => stamp,
      );
      log.push(`Notification: ${title}`);
      return true;
    }
    case "send_webhook": {
      const event =
        (action.config.event as WebhookEventName | undefined) ??
        webhookEventForTrigger(wf.trigger);
      const payload: Record<string, unknown> = {
        workflowId: wf.id,
        workflowName: wf.name,
        runId,
        ...Object.fromEntries(Object.entries(context).filter(([, v]) => v != null)),
      };
      const queued = queueWebhook(data, event, payload, () => rid("whd"), () => stamp);
      log.push(`Queued ${queued.length} webhook deliver(ies) for ${event}`);
      return true;
    }
    case "create_job_from_lead": {
      if (!lead) return false;
      const existing = data.jobs.find((j) => j.leadId === lead.id);
      if (existing) {
        log.push(`Job already exists for lead (${existing.id})`);
        return true;
      }
      const value = Number(action.config.estimatedValue ?? 0);
      const newJob: Job = {
        id: rid("job"),
        title: String(action.config.title ?? `${lead.jobType === "commercial" ? "Commercial" : "Residential"} exterior — ${lead.name}`),
        customerName: lead.name,
        address: lead.address,
        jobType: lead.jobType,
        status: "scheduled",
        leadId: lead.id,
        crewLeadId: action.config.crewLeadId ? String(action.config.crewLeadId) : null,
        startDate: addDays(stamp, Number(action.config.startInDays ?? 7)).slice(0, 10),
        estimatedValue: value,
        contractValue: value,
        notes: `Created by workflow "${wf.name}" when lead was ${lead.status}.`,
        createdAt: stamp,
      };
      data.jobs.unshift(newJob);
      log.push(`Created job ${newJob.id} from lead ${lead.name}`);
      return true;
    }
    case "create_invoice_draft": {
      if (!job) return false;
      const existing = data.invoices.find((i) => i.jobId === job.id && i.kind === "invoice");
      if (existing) {
        log.push(`Invoice already exists for job (${existing.id})`);
        return true;
      }
      const amount = job.contractValue || job.estimatedValue || 0;
      const doc: InvoiceDoc = {
        id: rid("inv"),
        jobId: job.id,
        kind: "invoice",
        status: "draft",
        customerName: job.customerName,
        lines: [
          {
            id: rid("line"),
            description: `${job.title} — contract total`,
            quantity: 1,
            unitPrice: amount,
          },
        ],
        includeProgress: Boolean(action.config.includeProgress ?? false),
        progressEntryIds: [],
        notes: `Draft generated by workflow "${wf.name}". Review before sending.`,
        aiSummary: null,
        createdAt: stamp,
        createdById: job.crewLeadId ?? authorId,
      };
      data.invoices.unshift(doc);
      log.push(`Drafted invoice ${doc.id} for ${job.title}`);
      return true;
    }
    case "update_lead_status": {
      if (!lead) return false;
      const status = String(action.config.status ?? "") as LeadStatus;
      if (!status || lead.status === status) {
        log.push("Lead status unchanged");
        return true;
      }
      lead.status = status;
      lead.updatedAt = stamp;
      lead.leadScore = scoreLead(lead);
      log.push(`Lead status → ${status}`);
      return true;
    }
    default:
      log.push(`Unknown action type: ${action.type}`);
      return false;
  }
}

function executeWorkflow(
  data: AppData,
  wf: WorkflowDefinition,
  trigger: WorkflowTrigger,
  context: WorkflowContext,
  createdAt?: string,
): WorkflowRun {
  const log: string[] = [];
  let ok = 0;
  const run = logRun(data, wf, trigger, context, [], "completed", createdAt);
  for (const action of wf.actions) {
    try {
      if (executeAction(data, wf, action, context, log, run.id)) ok += 1;
    } catch (err) {
      log.push(`Action ${action.type} threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  run.log = log;
  run.status = ok === wf.actions.length ? "completed" : ok > 0 ? "partial" : "failed";
  return run;
}

export function runSingleWorkflow(
  data: AppData,
  workflowId: string,
  context: WorkflowContext,
): WorkflowRun[] {
  const wf = data.workflows.find((w) => w.id === workflowId);
  if (!wf || !wf.enabled) return [];
  return [executeWorkflow(data, wf, wf.trigger, context)];
}

export function runWorkflows(
  data: AppData,
  trigger: WorkflowTrigger,
  context: WorkflowContext,
): WorkflowRun[] {
  return matchingWorkflows(data, trigger, context).map((wf) =>
    executeWorkflow(data, wf, trigger, context),
  );
}

/* ---------------- Event hooks (call these from routes / tools) ---------------- */

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

export function onJobCreated(data: AppData, job: Job, authorId?: string): WorkflowRun[] {
  return runWorkflows(data, "job_created", {
    jobId: job.id,
    leadId: job.leadId ?? undefined,
    jobStatus: job.status,
    authorId,
  });
}

export function onJobStatusChanged(data: AppData, job: Job, authorId?: string): WorkflowRun[] {
  return runWorkflows(data, "job_status_changed", {
    jobId: job.id,
    leadId: job.leadId ?? undefined,
    jobStatus: job.status,
    authorId,
  });
}

export function onInvoiceStatusChanged(
  data: AppData,
  invoice: InvoiceDoc,
  authorId?: string,
): WorkflowRun[] {
  return runWorkflows(data, "invoice_status_changed", {
    invoiceId: invoice.id,
    jobId: invoice.jobId,
    invoiceStatus: invoice.status,
    authorId,
  });
}

export function onProposalSigned(
  data: AppData,
  proposal: KnockProposal,
  authorId?: string,
): WorkflowRun[] {
  const pin = data.knocks.find((k) => k.id === proposal.pinId);
  return runWorkflows(data, "proposal_signed", {
    proposalId: proposal.id,
    leadId: pin?.leadId ?? undefined,
    authorId: authorId ?? proposal.createdById,
  });
}

export function onDamageReported(
  data: AppData,
  report: DamageReport,
  authorId?: string,
): WorkflowRun[] {
  return runWorkflows(data, "damage_reported", {
    damageReportId: report.id,
    jobId: report.jobId ?? undefined,
    severity: report.severity,
    authorId: authorId ?? report.reportedById,
  });
}

export function onTicketCreated(
  data: AppData,
  ticket: ServiceTicket,
  authorId?: string,
): WorkflowRun[] {
  return runWorkflows(data, "ticket_created", {
    ticketId: ticket.id,
    leadId: ticket.leadId ?? undefined,
    authorId,
  });
}

/**
 * Run `scheduled` workflows that are due. `triggerConfig.hour` (0–23) is the
 * earliest hour; each workflow runs at most once per calendar day.
 */
export function runScheduledWorkflows(data: AppData, now = new Date()): WorkflowRun[] {
  const todayKey = localDayKey(now);
  const hour = now.getHours();
  const runs: WorkflowRun[] = [];
  for (const wf of data.workflows) {
    if (!wf.enabled || wf.trigger !== "scheduled") continue;
    const wantHour = Number(wf.triggerConfig?.hour ?? 7);
    if (hour < wantHour) continue;
    const ranToday = data.workflowRuns.some(
      (r) => r.workflowId === wf.id && localDayKey(new Date(r.createdAt)) === todayKey,
    );
    if (ranToday) continue;
    runs.push(
      executeWorkflow(data, wf, "scheduled", { authorId: "emp-admin" }, now.toISOString()),
    );
  }
  return runs;
}

/** Process due sequence steps — demo: log email/call activities */
export function processSequenceSteps(data: AppData): number {
  const now = Date.now();
  let processed = 0;
  for (const enrollment of data.sequenceEnrollments) {
    if (enrollment.status !== "active" || !enrollment.nextRunAt) continue;
    if (new Date(enrollment.nextRunAt).getTime() > now) continue;

    const seq = data.sequences.find((x) => x.id === enrollment.sequenceId);
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

export const WORKFLOW_TRIGGER_LABELS: Record<WorkflowTrigger, string> = {
  lead_created: "Lead created",
  lead_status_changed: "Lead status changed",
  shift_posted_pool: "Shift posted to pool",
  job_created: "Job created",
  job_status_changed: "Job status changed",
  invoice_status_changed: "Invoice status changed",
  proposal_signed: "Proposal signed",
  damage_reported: "Damage reported",
  ticket_created: "Ticket created",
  scheduled: "Scheduled (daily)",
  manual: "Manual",
};
