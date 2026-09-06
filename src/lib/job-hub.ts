import { invoiceTotal } from "./customer-touches";
import { quoteTotals } from "./quotes";
import type { AppData, Job } from "./types";

/**
 * Everything about one job in one object — the API for /admin/jobs/[id] and
 * the customer portal. Pure over AppData (works in the browser demo too).
 */

export function jobHub(data: AppData, jobId: string) {
  const job = data.jobs.find((j) => j.id === jobId);
  if (!job) return null;
  const lead = job.leadId ? data.leads.find((l) => l.id === job.leadId) ?? null : null;
  const quotes = data.quotes.filter((q) => q.jobId === job.id || q.id === job.quoteId);
  const invoices = data.invoices.filter((i) => i.jobId === job.id);
  const payments = data.payments.filter((p) => p.jobId === job.id || invoices.some((i) => i.id === p.invoiceId));
  const documents = data.documents.filter((d) => d.jobId === job.id);
  const progress = data.jobProgress.filter((p) => p.jobId === job.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const materials = data.materials.filter((m) => m.jobId === job.id);
  const shifts = data.shifts.filter((s) => s.jobId === job.id).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const timeEntries = data.timeEntries.filter((t) => t.jobId === job.id);
  const damage = data.damageReports.filter((d) => d.jobId === job.id);
  const tools = data.toolCheckouts.filter((t) => t.jobId === job.id && !t.checkedInAt);
  const activities = data.activities.filter((a) => a.relatedId === job.id || (lead && a.relatedId === lead.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const messages = data.messages.filter((m) => m.jobId === job.id || (lead && m.leadId === lead.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const outreach = data.outreachQueue.filter((o) => o.jobId === job.id || (lead && o.leadId === lead.id));
  const ads = lead ? data.adListings.filter((a) => a.leadId === lead.id) : [];
  const workflowRuns = data.workflowRuns.filter((r) => r.context.jobId === job.id || (lead && r.context.leadId === lead.id)).slice(0, 20);

  const invoiced = invoices.filter((i) => i.kind === "invoice").reduce((s, i) => s + invoiceTotal(i), 0);
  const paid = payments.filter((p) => p.status === "succeeded").reduce((s, p) => s + p.amount, 0);
  const materialCost = materials.reduce((s, m) => s + m.quantity * m.unitCost, 0);
  const hours = timeEntries.reduce((s, t) => {
    if (!t.clockOut) return s;
    return s + (new Date(t.clockOut).getTime() - new Date(t.clockIn).getTime()) / 3_600_000;
  }, 0);
  const labourCost = timeEntries.reduce((s, t) => {
    if (!t.clockOut) return s;
    const rate = data.employees.find((e) => e.id === t.employeeId)?.hourlyRate ?? 0;
    return s + ((new Date(t.clockOut).getTime() - new Date(t.clockIn).getTime()) / 3_600_000) * rate;
  }, 0);
  const signedQuote = quotes.find((q) => q.status === "signed") ?? null;
  const contractValue = signedQuote ? quoteTotals(signedQuote).total : job.contractValue;
  const margin = contractValue - materialCost - labourCost;

  return {
    job,
    lead,
    crewLead: job.crewLeadId ? data.employees.find((e) => e.id === job.crewLeadId) ?? null : null,
    quotes,
    signedQuote,
    invoices,
    payments,
    documents,
    progress,
    materials,
    shifts,
    timeEntries,
    damage,
    tools,
    activities: activities.slice(0, 50),
    messages: messages.slice(0, 50),
    outreach,
    ads,
    workflowRuns,
    money: {
      contractValue,
      invoiced,
      paid,
      outstanding: Math.max(0, invoiced - paid),
      materialCost,
      labourCost,
      hours: Math.round(hours * 10) / 10,
      margin,
      marginPct: contractValue ? Math.round((margin / contractValue) * 100) : 0,
    },
    checklist: buildChecklist(data, job, { quotes, invoices, documents, progress, paid, invoiced }),
  };
}

export type HubChecklistItem = { key: string; label: string; done: boolean; hint?: string; href?: string };

function buildChecklist(
  data: AppData,
  job: Job,
  ctx: { quotes: AppData["quotes"]; invoices: AppData["invoices"]; documents: AppData["documents"]; progress: AppData["jobProgress"]; paid: number; invoiced: number },
): HubChecklistItem[] {
  const signed = ctx.quotes.some((q) => q.status === "signed");
  const contract = ctx.documents.some((d) => d.kind === "contract");
  const deposit = ctx.invoices.some((i) => i.notes.includes("deposit") && i.status === "paid");
  const scheduled = data.shifts.some((s) => s.jobId === job.id);
  const finalInvoice = ctx.invoices.some((i) => i.kind === "invoice" && !i.notes.includes("deposit"));
  const paidFull = ctx.invoiced > 0 && ctx.paid >= ctx.invoiced - 0.01;
  const report = ctx.documents.some((d) => d.kind === "job_report");
  const review = data.outreachQueue.some((o) => o.jobId === job.id && o.kind === "review" && o.status === "sent");
  return [
    { key: "quote", label: "Quote signed", done: signed, hint: signed ? undefined : "Create a quote and send it for e-signature" },
    { key: "contract", label: "Contract generated", done: contract },
    { key: "deposit", label: "Deposit paid", done: deposit },
    { key: "schedule", label: "Crew scheduled", done: scheduled, href: "/admin/schedule" },
    { key: "progress", label: "Site updates posted", done: ctx.progress.length > 0, hint: ctx.progress.length ? `${ctx.progress.length} update(s)` : "Crew posts photos from /apps/progress" },
    { key: "complete", label: "Job completed", done: job.status === "completed" || job.status === "invoiced" },
    { key: "report", label: "Job report sent", done: report },
    { key: "invoice", label: "Final invoice sent", done: finalInvoice },
    { key: "paid", label: "Paid in full", done: paidFull },
    { key: "review", label: "Review requested", done: review },
  ];
}

export type JobHub = NonNullable<ReturnType<typeof jobHub>>;
