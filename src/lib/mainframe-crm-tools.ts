import {
  findContractRecord,
  syncContractToCrm,
} from "./contracts";
import type { ToolContext, ToolExecution } from "./mainframe-tools";
import type {
  AppData,
  ContractRecord,
  CrmActivity,
  Deal,
  DealStage,
  Employee,
  EmployeeRole,
  InvoiceDoc,
  InvoiceStatus,
  Job,
  JobStatus,
  Lead,
  ServiceTicket,
  TicketPriority,
  TicketStatus,
} from "./types";

function findLeadLocal(data: AppData, query: string): Lead | undefined {
  const qv = query.trim().toLowerCase();
  if (!qv) return undefined;
  return data.leads.find(
    (l) => l.id === query || l.name.toLowerCase().includes(qv) || l.email.toLowerCase() === qv,
  );
}

export const EXTENDED_MAINFRAME_TOOL_NAMES = [
  "delete_lead",
  "delete_job",
  "delete_invoice",
  "delete_deal",
  "delete_ticket",
  "delete_company",
  "delete_activity",
  "delete_memory",
  "delete_outreach",
  "list_invoices",
  "update_invoice",
  "update_job",
  "list_deals",
  "create_deal",
  "update_deal",
  "list_tickets",
  "create_ticket",
  "update_ticket",
  "list_companies",
  "update_company",
  "list_employees",
  "update_employee",
  "list_activities",
  "complete_activity",
  "list_outreach",
  "update_outreach",
  "list_workflows",
  "list_contracts",
  "sync_contract",
  "register_contract",
] as const;

export type ExtendedMainframeToolName = (typeof EXTENDED_MAINFRAME_TOOL_NAMES)[number];

export function isExtendedMainframeTool(
  name: string,
): name is ExtendedMainframeToolName {
  return (EXTENDED_MAINFRAME_TOOL_NAMES as readonly string[]).includes(name);
}

export function executeExtendedMainframeTool(
  data: AppData,
  tool: ExtendedMainframeToolName,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  switch (tool) {
    case "delete_lead":
      return deleteById(data.leads, args, "lead", (l) => l.id, (l) => l.name);
    case "delete_job":
      return deleteById(data.jobs, args, "job", (j) => j.id, (j) => j.title);
    case "delete_invoice":
      return deleteById(data.invoices, args, "invoice", (i) => i.id, (i) => i.customerName);
    case "delete_deal":
      return deleteById(data.deals, args, "deal", (d) => d.id, (d) => d.title);
    case "delete_ticket":
      return deleteById(data.tickets, args, "ticket", (t) => t.id, (t) => t.subject);
    case "delete_company":
      return deleteById(data.companies, args, "company", (c) => c.id, (c) => c.name);
    case "delete_activity":
      return deleteById(data.activities, args, "activity", (a) => a.id, (a) => a.subject);
    case "delete_memory":
      return deleteById(data.assistantMemory, args, "memory", (m) => m.id, (m) => m.topic);
    case "delete_outreach":
      return deleteById(data.outreachQueue, args, "outreach", (o) => o.id, (o) => o.prospectName);
    case "list_invoices":
      return listSlice(
        data.invoices,
        args,
        (i) => `${i.customerName} [${i.status}] $${lineTotal(i)}`,
        (i) => i.id === String(args.id ?? "") || i.customerName.toLowerCase().includes(q(args)),
      );
    case "update_invoice":
      return updateInvoice(data, args);
    case "update_job":
      return updateJob(data, args, ctx);
    case "list_deals":
      return listSlice(
        data.deals,
        args,
        (d) => `${d.title} (${d.stage}) $${d.amount}`,
        (d) =>
          d.id === String(args.id ?? "") ||
          d.title.toLowerCase().includes(q(args)) ||
          (args.stage ? d.stage === args.stage : false),
      );
    case "create_deal":
      return createDeal(data, args, ctx);
    case "update_deal":
      return updateDeal(data, args, ctx);
    case "list_tickets":
      return listSlice(
        data.tickets,
        args,
        (t) => `${t.subject} [${t.status}/${t.priority}]`,
        (t) =>
          t.id === String(args.id ?? "") ||
          t.subject.toLowerCase().includes(q(args)) ||
          (args.status ? t.status === args.status : false),
      );
    case "create_ticket":
      return createTicket(data, args, ctx);
    case "update_ticket":
      return updateTicket(data, args, ctx);
    case "list_companies":
      return listSlice(
        data.companies,
        args,
        (c) => `${c.name} — ${c.city}`,
        (c) => c.id === String(args.id ?? "") || c.name.toLowerCase().includes(q(args)),
      );
    case "update_company":
      return updateCompany(data, args, ctx);
    case "list_employees":
      return listSlice(
        data.employees,
        args,
        (e) => `${e.name} (${e.login}, ${e.role})${e.active ? "" : " [inactive]"}`,
        (e) =>
          e.id === String(args.id ?? "") ||
          e.login.toLowerCase().includes(q(args)) ||
          e.name.toLowerCase().includes(q(args)),
      );
    case "update_employee":
      return updateEmployee(data, args, ctx);
    case "list_activities":
      return listSlice(
        data.activities,
        args,
        (a) => `${a.type}: ${a.subject}`,
        (a) =>
          a.id === String(args.id ?? "") ||
          a.subject.toLowerCase().includes(q(args)) ||
          (args.relatedId ? a.relatedId === args.relatedId : false),
      );
    case "complete_activity":
      return completeActivity(data, args, ctx);
    case "list_outreach":
      return listSlice(
        data.outreachQueue,
        args,
        (o) => `${o.prospectName} — ${o.subject} [${o.status}]`,
        (o) =>
          o.id === String(args.id ?? "") ||
          o.prospectName.toLowerCase().includes(q(args)) ||
          (args.status ? o.status === args.status : false),
      );
    case "update_outreach":
      return updateOutreach(data, args, ctx);
    case "list_workflows":
      return {
        ok: true,
        summary: data.workflows
          .map((w) => `${w.name} [${w.id}] ${w.enabled ? "on" : "off"}`)
          .join("; ") || "No workflows.",
        data: { workflows: data.workflows.slice(0, 12) },
      };
    case "list_contracts":
      return listContracts(data);
    case "sync_contract":
      return syncContractTool(data, args, ctx);
    case "register_contract":
      return registerContractTool(data, args, ctx);
    default:
      return { ok: false, summary: `Unknown extended tool: ${tool}` };
  }
}

function q(args: Record<string, unknown>): string {
  return String(args.query ?? args.id ?? "").toLowerCase();
}

function lineTotal(i: InvoiceDoc): number {
  return i.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
}

function deleteById<T>(
  list: T[],
  args: Record<string, unknown>,
  label: string,
  idOf: (item: T) => string,
  nameOf: (item: T) => string,
): ToolExecution {
  const query = String(args.id ?? args.query ?? args.name ?? "").trim();
  if (!query) return { ok: false, summary: `${label} id or name required.` };
  const lower = query.toLowerCase();
  const idx = list.findIndex(
    (item) =>
      idOf(item) === query ||
      nameOf(item).toLowerCase().includes(lower) ||
      idOf(item).toLowerCase().includes(lower),
  );
  if (idx < 0) return { ok: false, summary: `${label} not found.` };
  const removed = list.splice(idx, 1)[0];
  return {
    ok: true,
    summary: `Deleted ${label} "${nameOf(removed)}".`,
    data: { id: idOf(removed) },
  };
}

function listSlice<T>(
  list: T[],
  args: Record<string, unknown>,
  format: (item: T) => string,
  filter?: (item: T) => boolean,
): ToolExecution {
  let items = [...list];
  if (filter && q(args)) items = items.filter(filter);
  const slice = items.slice(0, 8);
  return {
    ok: true,
    summary: `${items.length} record(s). ${slice.map(format).join("; ") || "none"}.`,
    data: { total: items.length, items: slice },
  };
}

function findJob(data: AppData, query: string): Job | undefined {
  const qv = query.trim().toLowerCase();
  if (!qv) return undefined;
  return data.jobs.find(
    (j) =>
      j.id === query ||
      j.title.toLowerCase().includes(qv) ||
      j.customerName.toLowerCase().includes(qv),
  );
}

function findInvoice(data: AppData, query: string): InvoiceDoc | undefined {
  const qv = query.trim().toLowerCase();
  return data.invoices.find(
    (i) => i.id === query || i.customerName.toLowerCase().includes(qv),
  );
}

function findDeal(data: AppData, query: string): Deal | undefined {
  const qv = query.trim().toLowerCase();
  return data.deals.find(
    (d) => d.id === query || d.title.toLowerCase().includes(qv),
  );
}

function findTicket(data: AppData, query: string): ServiceTicket | undefined {
  const qv = query.trim().toLowerCase();
  return data.tickets.find(
    (t) => t.id === query || t.subject.toLowerCase().includes(qv),
  );
}

function findCompany(data: AppData, query: string) {
  const qv = query.trim().toLowerCase();
  return data.companies.find(
    (c) => c.id === query || c.name.toLowerCase().includes(qv),
  );
}

function findEmployee(data: AppData, query: string): Employee | undefined {
  const qv = query.trim().toLowerCase();
  return data.employees.find(
    (e) =>
      e.id === query ||
      e.login.toLowerCase() === qv ||
      e.name.toLowerCase().includes(qv),
  );
}

function findActivity(data: AppData, query: string): CrmActivity | undefined {
  const qv = query.trim().toLowerCase();
  return data.activities.find(
    (a) => a.id === query || a.subject.toLowerCase().includes(qv),
  );
}

function updateInvoice(data: AppData, args: Record<string, unknown>): ToolExecution {
  const inv = findInvoice(data, String(args.invoiceId ?? args.id ?? args.query ?? ""));
  if (!inv) return { ok: false, summary: "Invoice not found." };
  if (args.status) inv.status = args.status as InvoiceStatus;
  if (args.notes) inv.notes = String(args.notes);
  if (args.customerName) inv.customerName = String(args.customerName);
  return {
    ok: true,
    summary: `Invoice updated — ${inv.customerName} [${inv.status}].`,
    data: { invoiceId: inv.id },
  };
}

function updateJob(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const job = findJob(data, String(args.jobId ?? args.job ?? args.id ?? ""));
  if (!job) return { ok: false, summary: "Job not found." };
  if (args.title) job.title = String(args.title);
  if (args.customerName) job.customerName = String(args.customerName);
  if (args.address) job.address = String(args.address);
  if (args.status) job.status = args.status as JobStatus;
  if (args.contractValue != null) job.contractValue = Number(args.contractValue);
  if (args.estimatedValue != null) job.estimatedValue = Number(args.estimatedValue);
  if (args.notes) job.notes = String(args.notes);
  if (args.startDate) job.startDate = String(args.startDate);
  if (args.crewLeadId) job.crewLeadId = String(args.crewLeadId);
  return {
    ok: true,
    summary: `Job "${job.title}" updated — ${job.status}, $${job.contractValue}.`,
    data: { jobId: job.id },
  };
}

function createDeal(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const title = String(args.title ?? "").trim();
  if (!title) return { ok: false, summary: "Deal title required." };
  const stamp = ctx.nowIso();
  const lead = args.leadId || args.lead ? findLeadLocal(data, String(args.leadId ?? args.lead)) : undefined;
  const deal: Deal = {
    id: ctx.newId(),
    title,
    leadId: lead?.id ?? null,
    companyId: args.companyId ? String(args.companyId) : null,
    stage: (args.stage as DealStage) ?? "discovery",
    amount: Number(args.amount ?? 0),
    closeDate: args.closeDate ? String(args.closeDate) : null,
    ownerId: args.ownerId ? String(args.ownerId) : ctx.authorId,
    notes: String(args.notes ?? ""),
    createdAt: stamp,
    updatedAt: stamp,
  };
  data.deals.unshift(deal);
  return {
    ok: true,
    summary: `Created deal "${deal.title}" — ${deal.stage}, $${deal.amount}.`,
    data: { dealId: deal.id },
  };
}

function updateDeal(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const deal = findDeal(data, String(args.dealId ?? args.id ?? args.query ?? ""));
  if (!deal) return { ok: false, summary: "Deal not found." };
  if (args.title) deal.title = String(args.title);
  if (args.stage) deal.stage = args.stage as DealStage;
  if (args.amount != null) deal.amount = Number(args.amount);
  if (args.notes) deal.notes = String(args.notes);
  if (args.closeDate !== undefined) deal.closeDate = args.closeDate ? String(args.closeDate) : null;
  deal.updatedAt = ctx.nowIso();
  return {
    ok: true,
    summary: `Deal "${deal.title}" → ${deal.stage}, $${deal.amount}.`,
    data: { dealId: deal.id },
  };
}

function createTicket(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const subject = String(args.subject ?? "").trim();
  if (!subject) return { ok: false, summary: "Ticket subject required." };
  const stamp = ctx.nowIso();
  const ticket: ServiceTicket = {
    id: ctx.newId(),
    subject,
    description: String(args.description ?? ""),
    status: "new",
    priority: (args.priority as TicketPriority) ?? "medium",
    contactName: String(args.contactName ?? ""),
    contactEmail: String(args.contactEmail ?? ""),
    assigneeId: args.assigneeId ? String(args.assigneeId) : null,
    leadId: args.leadId ? String(args.leadId) : null,
    companyId: args.companyId ? String(args.companyId) : null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  data.tickets.unshift(ticket);
  return {
    ok: true,
    summary: `Created ticket "${ticket.subject}" [${ticket.priority}].`,
    data: { ticketId: ticket.id },
  };
}

function updateTicket(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const ticket = findTicket(data, String(args.ticketId ?? args.id ?? ""));
  if (!ticket) return { ok: false, summary: "Ticket not found." };
  if (args.status) ticket.status = args.status as TicketStatus;
  if (args.priority) ticket.priority = args.priority as TicketPriority;
  if (args.assigneeId !== undefined) ticket.assigneeId = args.assigneeId ? String(args.assigneeId) : null;
  if (args.description) ticket.description = String(args.description);
  ticket.updatedAt = ctx.nowIso();
  return {
    ok: true,
    summary: `Ticket "${ticket.subject}" → ${ticket.status}.`,
    data: { ticketId: ticket.id },
  };
}

function updateCompany(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const company = findCompany(data, String(args.companyId ?? args.id ?? args.name ?? ""));
  if (!company) return { ok: false, summary: "Company not found." };
  if (args.name) company.name = String(args.name);
  if (args.phone) company.phone = String(args.phone);
  if (args.address) company.address = String(args.address);
  if (args.city) company.city = String(args.city);
  if (args.notes) company.notes = String(args.notes);
  if (args.industry) company.industry = String(args.industry);
  return {
    ok: true,
    summary: `Updated company "${company.name}".`,
    data: { companyId: company.id },
  };
}

function updateEmployee(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const emp = findEmployee(data, String(args.employeeId ?? args.login ?? args.id ?? ""));
  if (!emp) return { ok: false, summary: "Employee not found." };
  if (args.name) emp.name = String(args.name);
  if (args.phone) emp.phone = String(args.phone);
  if (args.email) emp.email = String(args.email);
  if (args.role) emp.role = args.role as EmployeeRole;
  if (args.active != null) emp.active = Boolean(args.active);
  if (args.hourlyRate != null) emp.hourlyRate = Number(args.hourlyRate);
  return {
    ok: true,
    summary: `Updated ${emp.name} (${emp.login}, ${emp.role})${emp.active ? "" : " — deactivated"}.`,
    data: { employeeId: emp.id },
  };
}

function completeActivity(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const act = findActivity(data, String(args.activityId ?? args.id ?? args.subject ?? ""));
  if (!act) return { ok: false, summary: "Activity not found." };
  act.completedAt = ctx.nowIso();
  return {
    ok: true,
    summary: `Completed activity "${act.subject}".`,
    data: { activityId: act.id },
  };
}

function updateOutreach(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const query = String(args.id ?? args.query ?? "");
  const item = data.outreachQueue.find(
    (o) =>
      o.id === query ||
      o.prospectName.toLowerCase().includes(query.toLowerCase()),
  );
  if (!item) return { ok: false, summary: "Outreach item not found." };
  if (args.status) {
    item.status = args.status as typeof item.status;
    if (args.status === "sent") item.sentAt = ctx.nowIso();
  }
  if (args.message) item.message = String(args.message);
  if (args.subject) item.subject = String(args.subject);
  return {
    ok: true,
    summary: `Outreach "${item.prospectName}" → ${item.status}.`,
    data: { outreachId: item.id },
  };
}

function listContracts(data: AppData): ToolExecution {
  const rows = data.contracts.map(
    (c) => `${c.slug}: ${c.title} → ${c.publicPath} (job ${c.jobId ?? "none"})`,
  );
  return {
    ok: true,
    summary: rows.length
      ? rows.join("; ")
      : "No contracts registered. Use sync_contract after adding files under contracts/<slug>/.",
    data: { contracts: data.contracts },
  };
}

function syncContractTool(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const slug = String(args.slug ?? "snow").trim().toLowerCase();
  const meta = {
    title: String(args.title ?? `${slug} contract`),
    slug,
    customerName: String(args.customerName ?? "Contract client"),
    customerEmail: args.customerEmail ? String(args.customerEmail) : undefined,
    customerPhone: args.customerPhone ? String(args.customerPhone) : undefined,
    address: args.address ? String(args.address) : undefined,
    city: args.city ? String(args.city) : "Halifax",
    contractValue: Number(args.contractValue ?? 0),
    jobType: args.jobType === "commercial" ? ("commercial" as const) : ("residential" as const),
    jobTitle: args.jobTitle ? String(args.jobTitle) : undefined,
    notes: args.notes ? String(args.notes) : undefined,
    leadId: args.leadId ? String(args.leadId) : undefined,
    jobId: args.jobId ? String(args.jobId) : undefined,
  };
  const { contract, job, lead } = syncContractToCrm(data, slug, meta, ctx);
  return {
    ok: true,
    summary: `Synced contract "${slug}" at ${contract.publicPath}. Job: ${job?.title ?? "created"}. Lead: ${lead?.name ?? "created"}.`,
    data: { contractId: contract.id, jobId: job?.id, leadId: lead?.id },
  };
}

function registerContractTool(
  data: AppData,
  args: Record<string, unknown>,
  ctx: ToolContext,
): ToolExecution {
  const slug = String(args.slug ?? "").trim().toLowerCase();
  if (!slug) return { ok: false, summary: "slug is required." };
  const stamp = ctx.nowIso();
  const existing = findContractRecord(data, slug);
  const record: ContractRecord = {
    id: existing?.id ?? ctx.newId(),
    slug,
    title: String(args.title ?? existing?.title ?? `${slug} contract`),
    publicPath: `/contracts/${slug}`,
    fileName: String(args.fileName ?? existing?.fileName ?? "index.html"),
    mimeType: String(args.mimeType ?? existing?.mimeType ?? "text/html"),
    jobId: args.jobId ? String(args.jobId) : existing?.jobId ?? null,
    leadId: args.leadId ? String(args.leadId) : existing?.leadId ?? null,
    customerName: String(args.customerName ?? existing?.customerName ?? ""),
    contractValue: Number(args.contractValue ?? existing?.contractValue ?? 0),
    status: (args.status as ContractRecord["status"]) ?? existing?.status ?? "active",
    notes: String(args.notes ?? existing?.notes ?? ""),
    syncedAt: existing?.syncedAt ?? null,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  };
  if (existing) Object.assign(existing, record);
  else data.contracts.unshift(record);
  return {
    ok: true,
    summary: `Registered contract ${slug} at ${record.publicPath}. Run sync_contract to import job info from meta.json.`,
    data: { contractId: record.id },
  };
}
