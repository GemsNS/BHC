import { huntLeadsFromCriteria } from "./mainframe-prospects";
import { runDailyAutomations } from "./mainframe-automations";
import { findProspectsForLead, scoreLead } from "./lead-automation";
import type {
  AppData,
  AssistantCriteriaProfile,
  InvoiceDoc,
  InvoiceLine,
  Lead,
  LeadStatus,
} from "./types";
import {
  onLeadCreated,
  onLeadStatusChanged,
  processSequenceSteps,
  runSingleWorkflow,
} from "./workflows";

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
  "list_jobs",
  "create_invoice",
  "run_workflow",
  "process_sequences",
  "approve_outreach",
  "find_prospects",
  "hunt_leads",
  "save_criteria_profile",
  "create_task",
  "run_daily_automations",
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
    case "list_jobs":
      return toolListJobs(data, args);
    case "create_invoice":
      return toolCreateInvoice(data, args, ctx);
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
    case "create_task":
      return toolCreateTask(data, args, ctx);
    case "run_daily_automations":
      return toolRunDaily(data, args, ctx);
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
  const profile = data.assistantProfiles.find((p) => p.enabled);
  return {
    ok: true,
    summary: `CRM summary: ${openLeads} open leads, ${activeJobs} active jobs, ${pending} outreach draft(s) pending approval. Hunt profile: ${profile?.name ?? "none"}. ${data.assistantAutomations.filter((a) => a.enabled).length} daily automation(s) armed.`,
    data: { openLeads, pending, activeJobs },
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
