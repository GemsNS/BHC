import { huntLeadsFromCriteria } from "./mainframe-prospects";
import { runDailyAutomations } from "./mainframe-automations";
import { findProspectsForLead, scoreLead } from "./lead-automation";
import type {
  AppData,
  AssistantCriteriaProfile,
  AssistantMemoryEntry,
  Employee,
  EmployeeRole,
  InvoiceDoc,
  InvoiceLine,
  Job,
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
  "update_lead",
  "update_lead_status",
  "list_jobs",
  "create_job",
  "create_invoice",
  "run_workflow",
  "process_sequences",
  "approve_outreach",
  "find_prospects",
  "hunt_leads",
  "save_criteria_profile",
  "create_task",
  "run_daily_automations",
  "remember_knowledge",
  "search_knowledge",
  "import_data",
  "create_employee",
  "lookup_hrm",
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
    case "update_lead":
      return toolUpdateLead(data, args, ctx);
    case "update_lead_status":
      return toolUpdateLeadStatus(data, args, ctx);
    case "list_jobs":
      return toolListJobs(data, args);
    case "create_job":
      return toolCreateJob(data, args, ctx);
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
    case "remember_knowledge":
      return toolRememberKnowledge(data, args, ctx);
    case "search_knowledge":
      return toolSearchKnowledge(data, args);
    case "import_data":
      return toolImportData(data, args, ctx);
    case "create_employee":
      return toolCreateEmployee(data, args, ctx);
    case "lookup_hrm":
      return {
        ok: false,
        summary:
          "lookup_hrm requires server async — use from AI chat on Node host (not local parser).",
      };
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
    phone: String(args.phone ?? "(902) 000-0000"),
    email: String(args.email ?? ""),
    address: String(args.address ?? "TBD"),
    city: String(args.city ?? "Halifax"),
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
  const wfId = String(args.workflowId ?? "wf-new-lead");
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
    regions: (args.regions as string[]) ?? existing?.regions ?? ["Halifax", "Dartmouth"],
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
    (l) => l.id === q || l.name.toLowerCase().includes(q) || l.email.toLowerCase() === q,
  );
}

function toolUpdateLead(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const lead = findLead(data, String(args.leadId ?? args.lead ?? args.id ?? ""));
  if (!lead) return { ok: false, summary: "Lead not found." };
  const prevStatus = lead.status;
  if (args.name) lead.name = String(args.name);
  if (args.phone) lead.phone = String(args.phone);
  if (args.email) lead.email = String(args.email);
  if (args.address) lead.address = String(args.address);
  if (args.city) lead.city = String(args.city);
  if (args.notes) lead.notes = String(args.notes);
  if (args.source) lead.source = String(args.source);
  if (args.jobType) lead.jobType = args.jobType === "commercial" ? "commercial" : "residential";
  if (args.status) lead.status = args.status as LeadStatus;
  if (args.assignedToId) lead.assignedToId = String(args.assignedToId);
  lead.leadScore = scoreLead(lead);
  lead.updatedAt = ctx.nowIso();
  if (args.status && args.status !== prevStatus) {
    onLeadStatusChanged(data, lead, ctx.authorId);
  }
  return {
    ok: true,
    summary: `Updated lead "${lead.name}" (${lead.city}, ${lead.status}, score ${lead.leadScore}).`,
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
  const lead = args.leadId || args.lead ? findLead(data, String(args.leadId ?? args.lead)) : undefined;
  const stamp = ctx.nowIso();
  const job: Job = {
    id: ctx.newId(),
    title,
    customerName: String(args.customerName ?? lead?.name ?? "TBD"),
    address: String(args.address ?? lead?.address ?? "TBD"),
    jobType: args.jobType === "commercial" ? "commercial" : "residential",
    status: "scheduled",
    leadId: lead?.id ?? null,
    crewLeadId: args.crewLeadId ? String(args.crewLeadId) : "emp-field-1",
    startDate: String(args.startDate ?? stamp.slice(0, 10)),
    estimatedValue: Number(args.estimatedValue ?? 0),
    contractValue: Number(args.contractValue ?? args.estimatedValue ?? 0),
    notes: String(args.notes ?? "Created by Mainframe AI."),
    createdAt: stamp,
  };
  data.jobs.unshift(job);
  return {
    ok: true,
    summary: `Created job "${job.title}" for ${job.customerName} at ${job.address}.`,
    data: { jobId: job.id, leadId: lead?.id },
  };
}

function toolRememberKnowledge(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const topic = String(args.topic ?? "general").trim();
  const content = String(args.content ?? "").trim();
  if (!content) return { ok: false, summary: "content is required to remember." };
  const tags = Array.isArray(args.tags)
    ? (args.tags as string[]).map(String)
    : String(args.tags ?? "")
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean);
  const entry: AssistantMemoryEntry = {
    id: ctx.newId(),
    topic,
    content,
    tags,
    source: String(args.source ?? "mainframe_chat"),
    createdAt: ctx.nowIso(),
    authorId: ctx.authorId,
  };
  data.assistantMemory.unshift(entry);
  data.assistantAudit.unshift({
    id: ctx.newId(),
    action: "memory_saved",
    detail: `Remembered: ${topic} — ${content.slice(0, 120)}`,
    createdAt: ctx.nowIso(),
  });
  return {
    ok: true,
    summary: `Saved knowledge "${topic}" (${tags.join(", ") || "no tags"}). Mainframe will recall this in future turns.`,
    data: { memoryId: entry.id },
  };
}

function toolSearchKnowledge(data: AppData, args: Record<string, unknown>): ToolExecution {
  const q = String(args.query ?? args.topic ?? "").toLowerCase();
  if (!q) {
    const recent = data.assistantMemory.slice(0, 5);
    return {
      ok: true,
      summary: `Recent memory (${data.assistantMemory.length} total): ${recent.map((m) => m.topic).join("; ") || "empty"}.`,
      data: { memories: recent },
    };
  }
  const hits = data.assistantMemory.filter(
    (m) =>
      m.topic.toLowerCase().includes(q) ||
      m.content.toLowerCase().includes(q) ||
      m.tags.some((t) => t.toLowerCase().includes(q)),
  );
  return {
    ok: true,
    summary: `Found ${hits.length} memory entries for "${q}". ${hits
      .slice(0, 3)
      .map((m) => `${m.topic}: ${m.content.slice(0, 80)}`)
      .join(" | ")}`,
    data: { memories: hits.slice(0, 8) },
  };
}

function toolImportData(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const records = args.records as unknown;
  if (!Array.isArray(records)) {
    return {
      ok: false,
      summary:
        'import_data expects { records: [...] } with items type "lead" | "job" | "company" | "memory".',
    };
  }
  let leads = 0;
  let jobs = 0;
  let companies = 0;
  let memories = 0;
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    const type = String(rec.type ?? "lead").toLowerCase();
    if (type === "lead") {
      const r = toolCreateLead(data, rec, ctx);
      if (r.ok) leads++;
    } else if (type === "job") {
      const r = toolCreateJob(data, rec, ctx);
      if (r.ok) jobs++;
    } else if (type === "company") {
      const stamp = ctx.nowIso();
      data.companies.unshift({
        id: ctx.newId(),
        name: String(rec.name ?? "Imported company"),
        domain: String(rec.domain ?? rec.website ?? ""),
        industry: String(rec.industry ?? ""),
        phone: String(rec.phone ?? ""),
        address: String(rec.address ?? ""),
        city: String(rec.city ?? "Halifax"),
        notes: String(rec.notes ?? "Imported by Mainframe."),
        createdAt: stamp,
      });
      companies++;
    } else if (type === "memory") {
      const r = toolRememberKnowledge(data, rec, ctx);
      if (r.ok) memories++;
    }
  }
  return {
    ok: true,
    summary: `Imported ${leads} lead(s), ${jobs} job(s), ${companies} company(ies), ${memories} memory entries.`,
    data: { leads, jobs, companies, memories },
  };
}

function toolCreateEmployee(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const name = String(args.name ?? "").trim();
  const login = String(args.login ?? "").trim().toLowerCase();
  const role = String(args.role ?? "field") as EmployeeRole;
  if (!name || !login) return { ok: false, summary: "name and login are required." };
  if (data.employees.some((e) => e.login.toLowerCase() === login)) {
    return { ok: false, summary: `Login "${login}" already exists.` };
  }
  const generatedPin = String(args.pin ?? Math.floor(100000 + Math.random() * 900000));
  const emp: Employee = {
    id: ctx.newId(),
    name,
    email: String(args.email ?? `${login}@bhcontracting.co`),
    login,
    pin: generatedPin,
    role,
    phone: String(args.phone ?? "(902) 000-0000"),
    hireDate: ctx.nowIso().slice(0, 10),
    hourlyRate: Number(args.hourlyRate ?? 24),
    active: true,
  };
  data.employees.push(emp);
  return {
    ok: true,
    summary: `Created employee ${emp.name} (login: ${emp.login}, PIN: ${emp.pin}, role: ${emp.role}). Share PIN securely.`,
    data: { employeeId: emp.id, login: emp.login, pin: emp.pin },
  };
}

/** Async HRM public API lookup — server-side only */
export async function toolLookupHrmAsync(
  args: Record<string, unknown>,
): Promise<ToolExecution> {
  const { buildHrmContextSummary, fetchHrmWeather, geocodeNovaScotia } = await import(
    "./hrm-public"
  );
  const mode = String(args.mode ?? "summary").toLowerCase();
  try {
    if (mode === "weather") {
      const w = await fetchHrmWeather();
      return {
        ok: true,
        summary: `HRM weather: ${w.summary}, ${w.temperatureC}°C, wind ${w.windKmh} km/h.`,
        data: w as unknown as Record<string, unknown>,
      };
    }
    if (mode === "geocode") {
      const q = String(args.query ?? args.address ?? "");
      const hits = await geocodeNovaScotia(q);
      return {
        ok: true,
        summary: hits.length
          ? `Geocoded "${q}": ${hits[0].displayName} (${hits[0].lat}, ${hits[0].lon})`
          : `No geocode results for "${q}" in Nova Scotia.`,
        data: { results: hits },
      };
    }
    const summary = await buildHrmContextSummary();
    return { ok: true, summary, data: {} };
  } catch (err) {
    return {
      ok: false,
      summary: err instanceof Error ? err.message : "HRM lookup failed",
    };
  }
}
