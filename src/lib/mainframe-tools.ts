import { huntLeadsFromCriteria } from "./mainframe-prospects";
import { runDailyAutomations } from "./mainframe-automations";
import { findProspectsForLead, scoreLead } from "./lead-automation";
import type {
  AppData,
  AssistantCriteriaProfile,
  InvoiceDoc,
  InvoiceLine,
  Job,
  JobStatus,
  Lead,
  LeadStatus,
} from "./types";
import {
  onLeadCreated,
  onLeadStatusChanged,
  processSequenceSteps,
  runSingleWorkflow,
} from "./workflows";
import { queueQbOp, qbConnectionSummary } from "./quickbooks-ops";

export type ToolContext = {
  authorId: string;
  newId: () => string;
  nowIso: () => string;
};

export type ToolExecution = {
  ok: boolean;
  summary: string;
  data?: Record<string, unknown>;
};

export const MAINFRAME_TOOL_NAMES = [
  "get_summary",
  "list_leads",
  "create_lead",
  "update_lead_status",
  "update_lead",
  "list_jobs",
  "create_job",
  "update_job_status",
  "list_invoices",
  "create_invoice",
  "update_invoice_status",
  "list_tasks",
  "create_task",
  "complete_task",
  "list_automations",
  "set_automation",
  "run_workflow",
  "process_sequences",
  "approve_outreach",
  "find_prospects",
  "hunt_leads",
  "save_criteria_profile",
  "run_daily_automations",
  "list_time_entries",
  "qb_status",
  "qb_get_pnl",
  "qb_sync_customer",
  "qb_sync_invoice",
  "qb_sync_payroll_hours",
] as const;

export type MainframeToolName = (typeof MAINFRAME_TOOL_NAMES)[number];

export function executeMainframeTool(
  data: AppData,
  tool: MainframeToolName,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  switch (tool) {
    case "get_summary":
      return toolGetSummary(data);
    case "list_leads":
      return toolListLeads(data, args);
    case "create_lead":
      return toolCreateLead(data, args, ctx);
    case "update_lead_status":
      return toolUpdateLeadStatus(data, args, ctx);
    case "update_lead":
      return toolUpdateLead(data, args, ctx);
    case "list_jobs":
      return toolListJobs(data, args);
    case "create_job":
      return toolCreateJob(data, args, ctx);
    case "update_job_status":
      return toolUpdateJobStatus(data, args, ctx);
    case "list_invoices":
      return toolListInvoices(data, args);
    case "create_invoice":
      return toolCreateInvoice(data, args, ctx);
    case "update_invoice_status":
      return toolUpdateInvoiceStatus(data, args, ctx);
    case "list_tasks":
      return toolListTasks(data, args);
    case "create_task":
      return toolCreateTask(data, args, ctx);
    case "complete_task":
      return toolCompleteTask(data, args, ctx);
    case "list_automations":
      return toolListAutomations(data);
    case "set_automation":
      return toolSetAutomation(data, args, ctx);
    case "run_workflow":
      return toolRunWorkflow(data, args, ctx);
    case "process_sequences":
      return toolProcessSequences(data);
    case "approve_outreach":
      return toolApproveOutreach(data, args, ctx);
    case "find_prospects":
      return toolFindProspects(data, args, ctx);
    case "hunt_leads":
      return toolHuntLeads(data, args);
    case "save_criteria_profile":
      return toolSaveProfile(data, args, ctx);
    case "run_daily_automations":
      return toolRunDaily(data, args, ctx);
    case "list_time_entries":
      return toolListTimeEntries(data, args);
    case "qb_status":
    case "qb_get_pnl":
    case "qb_sync_customer":
    case "qb_sync_invoice":
    case "qb_sync_payroll_hours":
      return toolQbPlaceholder(tool, args);
    default:
      return { ok: false, summary: `Unknown tool: ${tool}` };
  }
}

function toolGetSummary(data: AppData): ToolExecution {
  const openLeads = data.leads.filter((l) => !["won", "lost"].includes(l.status)).length;
  const pending = data.outreachQueue.filter((o) => o.status === "pending_approval").length;
  const activeJobs = data.jobs.filter((j) =>
    ["scheduled", "in_progress"].includes(j.status),
  ).length;
  const openTasks = data.activities.filter((a) => a.type === "task" && !a.completedAt).length;
  const profile = data.assistantProfiles.find((p) => p.enabled);
  const qb = qbConnectionSummary();
  return {
    ok: true,
    summary: `CRM summary: ${openLeads} open leads, ${activeJobs} active jobs, ${openTasks} open task(s), ${pending} outreach draft(s) pending approval. Hunt profile: ${profile?.name ?? "none"}. ${data.assistantAutomations.filter((a) => a.enabled).length} daily automation(s) armed. QuickBooks: ${qb}.`,
    data: { openLeads, pending, activeJobs, openTasks },
  };
}

function toolListLeads(data: AppData, args: Record<string, unknown>): ToolExecution {
  const status = args.status as LeadStatus | undefined;
  const city = String(args.city ?? "").toLowerCase();
  let leads = data.leads;
  if (status) leads = leads.filter((l) => l.status === status);
  if (city) leads = leads.filter((l) => l.city.toLowerCase().includes(city));
  const slice = leads.slice(0, 8).map((l) => ({
    id: l.id,
    name: l.name,
    city: l.city,
    status: l.status,
    score: l.leadScore,
  }));
  return {
    ok: true,
    summary: `Found ${leads.length} lead(s). Top: ${slice.map((l) => `${l.name} (${l.status})`).join("; ") || "none"}.`,
    data: { leads: slice, total: leads.length },
  };
}

function toolCreateLead(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const name = String(args.name ?? "").trim();
  if (!name) return { ok: false, summary: "Lead name is required." };
  const stamp = ctx.nowIso();
  const lead: Lead = {
    id: ctx.newId(),
    name,
    phone: String(args.phone ?? "(555) 000-0000"),
    email: String(args.email ?? ""),
    address: String(args.address ?? "TBD"),
    city: String(args.city ?? "Denver"),
    source: String(args.source ?? "Mainframe AI"),
    status: (args.status as LeadStatus) ?? "new",
    jobType: args.jobType === "commercial" ? "commercial" : "residential",
    notes: String(args.notes ?? "Created by mainframe assistant."),
    assignedToId: null,
    companyId: null,
    leadScore: 50,
    createdAt: stamp,
    updatedAt: stamp,
  };
  lead.leadScore = scoreLead(lead);
  data.leads.unshift(lead);
  onLeadCreated(data, lead, ctx.authorId);
  return {
    ok: true,
    summary: `Created lead "${lead.name}" in ${lead.city} (${lead.jobType}, score ${lead.leadScore}). Workflows triggered.`,
    data: { leadId: lead.id },
  };
}

function toolUpdateLeadStatus(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const id = String(args.leadId ?? args.id ?? "");
  const status = args.status as LeadStatus;
  const lead = data.leads.find(
    (l) => l.id === id || l.name.toLowerCase().includes(id.toLowerCase()),
  );
  if (!lead) return { ok: false, summary: "Lead not found." };
  lead.status = status;
  lead.updatedAt = ctx.nowIso();
  onLeadStatusChanged(data, lead, ctx.authorId);
  return {
    ok: true,
    summary: `Updated ${lead.name} → ${status}.`,
    data: { leadId: lead.id },
  };
}

function toolListJobs(data: AppData, args: Record<string, unknown>): ToolExecution {
  const q = String(args.query ?? "").toLowerCase();
  let jobs = data.jobs;
  if (q) {
    jobs = jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.customerName.toLowerCase().includes(q) ||
        j.id.toLowerCase().includes(q),
    );
  }
  const slice = jobs.slice(0, 6).map((j) => ({
    id: j.id,
    title: j.title,
    customer: j.customerName,
    status: j.status,
    value: j.contractValue,
  }));
  return {
    ok: true,
    summary: `${jobs.length} job(s). ${slice.map((j) => `${j.title} [${j.id}]`).join("; ") || "none"}.`,
    data: { jobs: slice },
  };
}

function toolCreateInvoice(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const jobQuery = String(args.jobId ?? args.job ?? "");
  const job = data.jobs.find(
    (j) =>
      j.id === jobQuery ||
      j.title.toLowerCase().includes(jobQuery.toLowerCase()) ||
      j.customerName.toLowerCase().includes(jobQuery.toLowerCase()),
  );
  if (!job) return { ok: false, summary: "Job not found — specify job title or id." };

  const lines: InvoiceLine[] = [];
  if (args.autoLinesFromMaterials !== false) {
    for (const m of data.materials.filter((x) => x.jobId === job.id)) {
      lines.push({
        id: ctx.newId(),
        description: m.description,
        quantity: m.quantity,
        unitPrice: m.unitCost,
      });
    }
  }
  if (!lines.length) {
    lines.push({
      id: ctx.newId(),
      description: `${job.title} — contract progress`,
      quantity: 1,
      unitPrice: job.contractValue || job.estimatedValue || 0,
    });
  }

  const doc: InvoiceDoc = {
    id: ctx.newId(),
    jobId: job.id,
    kind: args.kind === "full_report" ? "full_report" : "invoice",
    status: "draft",
    customerName: job.customerName,
    lines,
    includeProgress: args.kind === "full_report",
    progressEntryIds: data.jobProgress.filter((p) => p.jobId === job.id).map((p) => p.id),
    notes: String(args.notes ?? "Generated by mainframe assistant."),
    aiSummary: null,
    createdAt: ctx.nowIso(),
    createdById: ctx.authorId,
  };
  data.invoices.unshift(doc);
  return {
    ok: true,
    summary: `Draft ${doc.kind} created for "${job.title}" — ${lines.length} line(s), total $${lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0).toLocaleString()}.`,
    data: { invoiceId: doc.id, jobId: job.id },
  };
}

function toolRunWorkflow(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const wfId = String(args.workflowId ?? "wf-2");
  const leadId = args.leadId ? String(args.leadId) : undefined;
  const runs = runSingleWorkflow(data, wfId, {
    leadId,
    authorId: ctx.authorId,
  });
  if (!runs.length) return { ok: false, summary: `Workflow ${wfId} not found or disabled.` };
  return {
    ok: true,
    summary: `Ran workflow — ${runs[0].log.join(" ")}`,
    data: { runId: runs[0].id },
  };
}

function toolProcessSequences(data: AppData): ToolExecution {
  const n = processSequenceSteps(data);
  return { ok: true, summary: `Processed ${n} due sequence step(s).` };
}

function toolApproveOutreach(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const all = Boolean(args.all);
  const id = args.id ? String(args.id) : "";
  const pending = data.outreachQueue.filter((o) => o.status === "pending_approval");
  if (!pending.length) return { ok: true, summary: "No outreach drafts pending approval." };

  const targets = all
    ? pending
    : pending.filter((o) => o.id === id || o.prospectName.toLowerCase().includes(id.toLowerCase()));

  if (!targets.length) return { ok: false, summary: "Outreach item not found." };

  const stamp = ctx.nowIso();
  for (const item of targets) {
    item.status = "approved";
    data.activities.unshift({
      id: ctx.newId(),
      type: "email",
      subject: `Approved outreach: ${item.subject}`,
      body: item.message,
      relatedType: "lead",
      relatedId: item.leadId ?? "general",
      authorId: ctx.authorId,
      dueAt: null,
      completedAt: stamp,
      createdAt: stamp,
    });
  }
  return {
    ok: true,
    summary: `Approved ${targets.length} outreach draft(s). Mark sent from Outreach tab when GoDaddy SMTP is wired.`,
  };
}

function toolFindProspects(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const leadQuery = String(args.leadId ?? args.lead ?? "");
  const lead = data.leads.find(
    (l) =>
      l.id === leadQuery ||
      l.name.toLowerCase().includes(leadQuery.toLowerCase()) ||
      l.status === "qualified",
  );
  if (!lead) return { ok: false, summary: "Specify a lead name/id or qualify a lead first." };
  const limit = Number(args.limit ?? 3);
  const prospects = findProspectsForLead(data, lead, limit);
  const stamp = ctx.nowIso();
  for (const p of prospects) {
    data.outreachQueue.unshift({
      ...p,
      id: ctx.newId(),
      status: "pending_approval",
      workflowRunId: null,
      sentAt: null,
      createdAt: stamp,
    });
  }
  return {
    ok: true,
    summary: `Queued ${prospects.length} prospect draft(s) for ${lead.name}. Awaiting approval.`,
  };
}

function toolHuntLeads(data: AppData, args: Record<string, unknown>): ToolExecution {
  const { matchedLeads, queued, notes } = huntLeadsFromCriteria(
    data,
    args.profileId ? String(args.profileId) : undefined,
    Number(args.limit ?? 5),
  );
  return {
    ok: true,
    summary: `Lead hunt complete: ${matchedLeads.length} matched, ${queued} outreach draft(s) queued. ${notes.join(" ")}`,
    data: { matched: matchedLeads.length, queued },
  };
}

function toolSaveProfile(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const stamp = ctx.nowIso();
  const id = String(args.id ?? "profile-default");
  const existing = data.assistantProfiles.find((p) => p.id === id);
  const profile: AssistantCriteriaProfile = {
    id,
    name: String(args.name ?? existing?.name ?? "Custom hunt profile"),
    jobTypes:
      (args.jobTypes as AssistantCriteriaProfile["jobTypes"]) ??
      existing?.jobTypes ??
      (["residential"] as const),
    regions: (args.regions as string[]) ?? existing?.regions ?? ["Denver"],
    keywords: (args.keywords as string[]) ?? existing?.keywords ?? ["roof"],
    minLeadScore: Number(args.minLeadScore ?? existing?.minLeadScore ?? 55),
    outreachTone: String(args.outreachTone ?? existing?.outreachTone ?? "Professional."),
    enabled: args.enabled !== false,
    updatedAt: stamp,
  };
  if (existing) {
    Object.assign(existing, profile);
  } else {
    data.assistantProfiles.unshift(profile);
  }
  return {
    ok: true,
    summary: `Saved hunt criteria "${profile.name}" — regions: ${profile.regions.join(", ")}; keywords: ${profile.keywords.join(", ")}.`,
    data: { profileId: profile.id },
  };
}

function toolCreateTask(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const subject = String(args.subject ?? "Follow up");
  const leadQuery = String(args.leadId ?? args.lead ?? "");
  const lead = leadQuery
    ? data.leads.find(
        (l) =>
          l.id === leadQuery || l.name.toLowerCase().includes(leadQuery.toLowerCase()),
      )
    : undefined;
  data.activities.unshift({
    id: ctx.newId(),
    type: "task",
    subject,
    body: String(args.body ?? "Created by mainframe assistant."),
    relatedType: lead ? "lead" : "job",
    relatedId: lead?.id ?? String(args.relatedId ?? "general"),
    authorId: ctx.authorId,
    dueAt: args.dueAt ? String(args.dueAt) : ctx.nowIso(),
    completedAt: null,
    createdAt: ctx.nowIso(),
  });
  return {
    ok: true,
    summary: `Task created: ${subject}${lead ? ` for ${lead.name}` : ""}.`,
  };
}

function toolRunDaily(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const results = runDailyAutomations(data, ctx.newId, {
    force: Boolean(args.force),
  });
  if (!results.length) {
    return {
      ok: true,
      summary: "No daily automations due right now. Use force:true to run all enabled automations.",
    };
  }
  return { ok: true, summary: results.join("\n") };
}

function findLead(data: AppData, query: string): Lead | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return data.leads.find(
    (l) => l.id === query || l.name.toLowerCase().includes(q) || l.email.toLowerCase() === q,
  );
}

function findJob(data: AppData, query: string): Job | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return data.jobs.find(
    (j) =>
      j.id === query ||
      j.title.toLowerCase().includes(q) ||
      j.customerName.toLowerCase().includes(q),
  );
}

function toolUpdateLead(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const lead = findLead(data, String(args.lead ?? args.leadId ?? args.id ?? ""));
  if (!lead) return { ok: false, summary: "Lead not found — pass lead name or id." };
  if (args.notes != null) lead.notes = String(args.notes);
  if (args.phone != null) lead.phone = String(args.phone);
  if (args.email != null) lead.email = String(args.email);
  if (args.city != null) lead.city = String(args.city);
  if (args.address != null) lead.address = String(args.address);
  if (args.assignedToId != null) lead.assignedToId = String(args.assignedToId) || null;
  if (args.source != null) lead.source = String(args.source);
  lead.updatedAt = ctx.nowIso();
  return {
    ok: true,
    summary: `Updated lead ${lead.name} (${lead.id}).`,
    data: { leadId: lead.id },
  };
}

function toolCreateJob(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const title = String(args.title ?? "").trim();
  if (!title) return { ok: false, summary: "Job title is required." };
  const lead = findLead(data, String(args.lead ?? args.leadId ?? ""));
  const stamp = ctx.nowIso();
  const job: Job = {
    id: ctx.newId(),
    title,
    customerName: String(args.customerName ?? lead?.name ?? "Customer TBD"),
    address: String(args.address ?? lead?.address ?? "TBD"),
    jobType: args.jobType === "commercial" ? "commercial" : "residential",
    status: (String(args.status ?? "scheduled") as JobStatus) || "scheduled",
    leadId: lead?.id ?? null,
    crewLeadId: args.crewLeadId ? String(args.crewLeadId) : null,
    startDate: String(args.startDate ?? stamp.slice(0, 10)),
    estimatedValue: Number(args.estimatedValue ?? 0),
    contractValue: Number(args.contractValue ?? args.estimatedValue ?? 0),
    notes: String(args.notes ?? "Created by Mainframe."),
    createdAt: stamp,
  };
  data.jobs.unshift(job);
  return {
    ok: true,
    summary: `Created job "${job.title}" for ${job.customerName} [${job.id}] (${job.status}).`,
    data: { jobId: job.id },
  };
}

function toolUpdateJobStatus(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const job = findJob(data, String(args.job ?? args.jobId ?? args.id ?? ""));
  if (!job) return { ok: false, summary: "Job not found — pass title or id." };
  const status = String(args.status ?? "") as JobStatus;
  const allowed: JobStatus[] = [
    "scheduled",
    "in_progress",
    "on_hold",
    "completed",
    "invoiced",
  ];
  if (!allowed.includes(status)) {
    return { ok: false, summary: `Invalid status. Use: ${allowed.join(", ")}` };
  }
  job.status = status;
  if (args.notes != null) job.notes = `${job.notes}\n${String(args.notes)}`.trim();
  void ctx;
  return {
    ok: true,
    summary: `Job "${job.title}" → ${status}.`,
    data: { jobId: job.id, status },
  };
}

function toolListInvoices(data: AppData, args: Record<string, unknown>): ToolExecution {
  let list = data.invoices;
  if (args.status) list = list.filter((i) => i.status === String(args.status));
  if (args.job) {
    const q = String(args.job).toLowerCase();
    list = list.filter(
      (i) =>
        i.jobId.toLowerCase().includes(q) ||
        i.customerName.toLowerCase().includes(q),
    );
  }
  const top = list.slice(0, 10).map((i) => ({
    id: i.id,
    customer: i.customerName,
    status: i.status,
    kind: i.kind,
    total: i.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
  }));
  return {
    ok: true,
    summary: `${list.length} invoice(s). Top: ${
      top.map((i) => `${i.id} ${i.customer} [${i.status}] $${i.total.toLocaleString()}`).join("; ") ||
      "none"
    }.`,
    data: { invoices: top, total: list.length },
  };
}

function toolUpdateInvoiceStatus(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const q = String(args.invoice ?? args.invoiceId ?? args.id ?? "");
  const inv = data.invoices.find(
    (i) =>
      i.id === q ||
      i.customerName.toLowerCase().includes(q.toLowerCase()) ||
      i.jobId === q,
  );
  if (!inv) return { ok: false, summary: "Invoice not found." };
  const status = String(args.status ?? "") as InvoiceDoc["status"];
  if (!["draft", "sent", "paid", "void"].includes(status)) {
    return { ok: false, summary: "Status must be draft, sent, paid, or void." };
  }
  inv.status = status;
  void ctx;
  return {
    ok: true,
    summary: `Invoice ${inv.id} (${inv.customerName}) → ${status}.`,
    data: { invoiceId: inv.id, status },
  };
}

function toolListTasks(data: AppData, args: Record<string, unknown>): ToolExecution {
  let tasks = data.activities.filter((a) => a.type === "task");
  if (args.openOnly !== false && args.open !== false) {
    if (args.includeCompleted !== true) {
      tasks = tasks.filter((t) => !t.completedAt);
    }
  }
  if (args.query) {
    const q = String(args.query).toLowerCase();
    tasks = tasks.filter(
      (t) =>
        t.subject.toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q) ||
        t.relatedId.toLowerCase().includes(q),
    );
  }
  const top = tasks.slice(0, 12).map((t) => ({
    id: t.id,
    subject: t.subject,
    related: `${t.relatedType}:${t.relatedId}`,
    dueAt: t.dueAt,
    done: Boolean(t.completedAt),
  }));
  return {
    ok: true,
    summary: `${tasks.length} task(s). ${
      top.map((t) => `${t.done ? "✓" : "○"} ${t.subject} [${t.id}]`).join("; ") || "none"
    }.`,
    data: { tasks: top },
  };
}

function toolCompleteTask(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const q = String(args.task ?? args.taskId ?? args.id ?? args.subject ?? "");
  const task = data.activities.find(
    (a) =>
      a.type === "task" &&
      (a.id === q || a.subject.toLowerCase().includes(q.toLowerCase())),
  );
  if (!task) return { ok: false, summary: "Task not found — pass id or subject." };
  if (task.completedAt) {
    return { ok: true, summary: `Task already completed: ${task.subject}.` };
  }
  task.completedAt = ctx.nowIso();
  return {
    ok: true,
    summary: `Completed task: ${task.subject} [${task.id}].`,
    data: { taskId: task.id },
  };
}

function toolListAutomations(data: AppData): ToolExecution {
  const rows = data.assistantAutomations.map((a) => ({
    id: a.id,
    name: a.name,
    enabled: a.enabled,
    runHour: a.runHour,
    action: a.action,
    lastRunAt: a.lastRunAt,
  }));
  return {
    ok: true,
    summary: rows
      .map(
        (a) =>
          `${a.enabled ? "ON" : "OFF"} ${a.name} [${a.id}] @${a.runHour}:00 (${a.action})`,
      )
      .join("\n"),
    data: { automations: rows },
  };
}

function toolSetAutomation(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const q = String(args.automation ?? args.id ?? args.name ?? "");
  const auto = data.assistantAutomations.find(
    (a) =>
      a.id === q || a.name.toLowerCase().includes(q.toLowerCase()),
  );
  if (!auto) return { ok: false, summary: "Automation not found." };
  if (args.enabled != null) auto.enabled = Boolean(args.enabled);
  if (args.runHour != null) auto.runHour = Number(args.runHour);
  void ctx;
  return {
    ok: true,
    summary: `Automation "${auto.name}" → enabled=${auto.enabled}, runHour=${auto.runHour}.`,
    data: { id: auto.id, enabled: auto.enabled, runHour: auto.runHour },
  };
}

function toolListTimeEntries(data: AppData, args: Record<string, unknown>): ToolExecution {
  let entries = data.timeEntries;
  if (args.employeeId) {
    entries = entries.filter((e) => e.employeeId === String(args.employeeId));
  }
  if (args.openOnly) {
    entries = entries.filter((e) => !e.clockOut);
  }
  const top = entries.slice(0, 15).map((e) => {
    const emp = data.employees.find((x) => x.id === e.employeeId);
    return {
      id: e.id,
      employee: emp?.name ?? e.employeeId,
      clockIn: e.clockIn,
      clockOut: e.clockOut,
      jobId: e.jobId,
    };
  });
  return {
    ok: true,
    summary: `${entries.length} time entr(y/ies). ${
      top
        .map(
          (e) =>
            `${e.employee} ${e.clockIn.slice(0, 16)}${e.clockOut ? " → " + e.clockOut.slice(0, 16) : " (open)"}`,
        )
        .join("; ") || "none"
    }.`,
    data: { entries: top },
  };
}

function toolQbPlaceholder(
  tool: MainframeToolName,
  args: Record<string, unknown>,
): ToolExecution {
  if (tool === "qb_status") {
    return {
      ok: true,
      summary: `QuickBooks: ${qbConnectionSummary()}. Use Books & P&L to connect credentials. Sync tools queue payroll/invoice/customer pushes.`,
      data: { connected: qbConnectionSummary().startsWith("connected") },
    };
  }
  const queued = queueQbOp(tool, args);
  return {
    ok: queued.ok,
    summary: queued.summary,
    data: queued.data,
  };
}
