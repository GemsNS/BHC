import { companyProfile } from "./ad-classify";
import { live } from "./events";
import { nextNumber, publicToken } from "./numbering";
import { queueWebhook } from "./webhooks";
import { onJobCreated } from "./workflows";
import type { AppData, InvoiceDoc, Job, Lead, Quote, QuoteLine } from "./types";

/**
 * Quotes: build → send (public link) → customer views/signs → job + deposit
 * invoice are created automatically. Pure over AppData.
 */

type Ctx = { newId: () => string; nowIso: () => string };

export const NS_HST = 0.15;

export const DEFAULT_TERMS = `1. This quote is valid until the date shown; pricing may change after that due to material costs.
2. A deposit of the percentage shown is due on acceptance; the balance is due on completion unless otherwise agreed in writing.
3. Price includes labour, listed materials, and disposal of removed materials. Unforeseen conditions (rot, structural repairs, permit changes) will be quoted separately before work proceeds.
4. Schedule dates are estimates and depend on weather and material availability.
5. Workmanship is warranted for 2 years; manufacturer warranties apply to materials.
6. Signing electronically has the same effect as a handwritten signature.`;

export function quoteSubtotal(q: Pick<Quote, "lines">): number {
  return q.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
}

export function quoteTotals(q: Pick<Quote, "lines" | "taxRate" | "discount" | "depositPercent">) {
  const subtotal = quoteSubtotal(q);
  const discounted = Math.max(0, subtotal - (q.discount || 0));
  const tax = Math.round(discounted * q.taxRate * 100) / 100;
  const total = Math.round((discounted + tax) * 100) / 100;
  const deposit = Math.round(total * (q.depositPercent / 100) * 100) / 100;
  return { subtotal, discount: q.discount || 0, taxable: discounted, tax, total, deposit, balance: Math.round((total - deposit) * 100) / 100 };
}

export type NewQuoteInput = {
  jobId?: string | null;
  leadId?: string | null;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  address?: string;
  title?: string;
  scope?: string;
  lines?: Array<Partial<QuoteLine> & { description: string }>;
  taxRate?: number;
  discount?: number;
  depositPercent?: number;
  validDays?: number;
  notes?: string;
  terms?: string;
  createdById: string;
};

export function createQuote(data: AppData, input: NewQuoteInput, ctx: Ctx): Quote {
  const job = input.jobId ? data.jobs.find((j) => j.id === input.jobId) : undefined;
  const lead = input.leadId ? data.leads.find((l) => l.id === input.leadId) : job?.leadId ? data.leads.find((l) => l.id === job.leadId) : undefined;
  const stamp = ctx.nowIso();
  const validDays = input.validDays ?? 30;
  const quote: Quote = {
    id: ctx.newId(),
    number: nextNumber(data, "quote"),
    jobId: job?.id ?? null,
    leadId: lead?.id ?? null,
    customerName: input.customerName ?? lead?.name ?? job?.customerName ?? "",
    customerEmail: input.customerEmail ?? lead?.email ?? "",
    customerPhone: input.customerPhone ?? lead?.phone ?? "",
    address: input.address ?? job?.address ?? lead?.address ?? "",
    title: input.title ?? job?.title ?? (lead ? `${lead.jobType === "commercial" ? "Commercial" : "Residential"} exterior work — ${lead.name}` : "Exterior work"),
    scope: input.scope ?? "",
    lines: (input.lines ?? []).map((l) => ({
      id: l.id ?? ctx.newId(),
      description: l.description,
      quantity: Number(l.quantity ?? 1),
      unit: l.unit ?? "ea",
      unitPrice: Number(l.unitPrice ?? 0),
      kind: l.kind ?? "other",
    })),
    taxRate: input.taxRate ?? NS_HST,
    discount: input.discount ?? 0,
    depositPercent: input.depositPercent ?? 30,
    validUntil: new Date(Date.now() + validDays * 86_400_000).toISOString(),
    status: "draft",
    token: publicToken(ctx.newId),
    sentAt: null,
    viewedAt: null,
    signedAt: null,
    signerName: null,
    signerEmail: null,
    signatureDataUrl: null,
    declinedReason: null,
    notes: input.notes ?? "",
    terms: input.terms ?? DEFAULT_TERMS,
    pdfUrl: null,
    createdById: input.createdById,
    createdAt: stamp,
    updatedAt: stamp,
  };
  data.quotes.unshift(quote);
  if (job) job.quoteId = quote.id;
  live.document(`Quote ${quote.number} drafted`, `${quote.customerName} · ${quote.title}`, { jobId: quote.jobId ?? undefined, leadId: quote.leadId ?? undefined });
  return quote;
}

export function updateQuote(data: AppData, id: string, patch: Partial<Quote>, ctx: Ctx): Quote | null {
  const q = data.quotes.find((x) => x.id === id);
  if (!q) return null;
  if (q.status === "signed") return q; // signed quotes are immutable
  const allowed: Array<keyof Quote> = ["customerName", "customerEmail", "customerPhone", "address", "title", "scope", "lines", "taxRate", "discount", "depositPercent", "validUntil", "notes", "terms", "leadId", "jobId"];
  for (const k of allowed) {
    if (k in patch && patch[k] !== undefined) (q as unknown as Record<string, unknown>)[k] = patch[k];
  }
  if (Array.isArray(patch.lines)) q.lines = patch.lines.map((l) => ({ ...l, id: l.id || ctx.newId() }));
  q.updatedAt = ctx.nowIso();
  return q;
}

export function quotePublicUrl(q: Quote, base: string): string {
  return `${base.replace(/\/$/, "")}/q/${q.token}`;
}

export function markQuoteSent(q: Quote, ctx: Ctx) {
  if (q.status === "draft" || q.status === "expired") q.status = "sent";
  q.sentAt = q.sentAt ?? ctx.nowIso();
  q.updatedAt = ctx.nowIso();
}

export function markQuoteViewed(q: Quote, ctx: Ctx) {
  if (!q.viewedAt) q.viewedAt = ctx.nowIso();
  if (q.status === "sent") q.status = "viewed";
  if (q.validUntil && new Date(q.validUntil).getTime() < Date.now() && q.status !== "signed") q.status = "expired";
}

export type SignResult = { quote: Quote; job: Job; depositInvoice: InvoiceDoc | null; lead: Lead | null };

/**
 * Customer signs: quote → signed, job created (or updated), deposit invoice
 * drafted, lead → won. Idempotent — signing twice returns the same records.
 */
export function signQuote(
  data: AppData,
  q: Quote,
  input: { signerName: string; signerEmail?: string; signatureDataUrl: string },
  ctx: Ctx,
): SignResult {
  const stamp = ctx.nowIso();
  const totals = quoteTotals(q);
  if (q.status !== "signed") {
    q.status = "signed";
    q.signedAt = stamp;
    q.signerName = input.signerName;
    q.signerEmail = input.signerEmail ?? q.customerEmail;
    q.signatureDataUrl = input.signatureDataUrl;
    q.updatedAt = stamp;
  }

  let lead = q.leadId ? data.leads.find((l) => l.id === q.leadId) ?? null : null;
  let job = q.jobId ? data.jobs.find((j) => j.id === q.jobId) ?? null : null;
  if (!job) {
    job = data.jobs.find((j) => j.quoteId === q.id) ?? null;
  }
  if (!job) {
    job = {
      id: ctx.newId(),
      number: nextNumber(data, "job"),
      title: q.title,
      customerName: q.customerName,
      address: q.address,
      jobType: lead?.jobType ?? "residential",
      status: "scheduled",
      leadId: lead?.id ?? null,
      crewLeadId: null,
      startDate: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
      estimatedValue: totals.total,
      contractValue: totals.total,
      notes: `Created from signed quote ${q.number}.`,
      createdAt: stamp,
      quoteId: q.id,
      portalToken: publicToken(ctx.newId),
    };
    data.jobs.unshift(job);
    onJobCreated(data, job, q.createdById);
    live.job(`Job ${job.number} created from signed quote`, `${job.title} · $${totals.total.toLocaleString()}`, { jobId: job.id, leadId: lead?.id });
  } else {
    job.contractValue = totals.total;
    job.quoteId = q.id;
    if (!job.portalToken) job.portalToken = publicToken(ctx.newId);
    if (!job.number) job.number = nextNumber(data, "job");
  }
  q.jobId = job.id;

  if (lead) {
    if (lead.status !== "won") {
      lead.status = "won";
      lead.updatedAt = stamp;
    }
  } else if (q.customerEmail || q.customerPhone) {
    lead = {
      id: ctx.newId(),
      name: q.customerName,
      phone: q.customerPhone,
      email: q.customerEmail,
      address: q.address,
      city: "",
      source: "Quote",
      status: "won",
      jobType: job.jobType,
      notes: `Signed quote ${q.number}`,
      assignedToId: null,
      companyId: null,
      leadScore: 90,
      createdAt: stamp,
      updatedAt: stamp,
    };
    data.leads.unshift(lead);
    q.leadId = lead.id;
    job.leadId = lead.id;
  }

  let depositInvoice: InvoiceDoc | null = data.invoices.find((i) => i.jobId === job!.id && i.notes.includes(`deposit for ${q.number}`)) ?? null;
  if (!depositInvoice && totals.deposit > 0) {
    depositInvoice = {
      id: ctx.newId(),
      number: nextNumber(data, "invoice"),
      jobId: job.id,
      kind: "invoice",
      status: "draft",
      customerName: q.customerName,
      lines: [{ id: ctx.newId(), description: `Deposit (${q.depositPercent}%) — ${q.title}`, quantity: 1, unitPrice: totals.deposit }],
      includeProgress: false,
      progressEntryIds: [],
      notes: `Auto-generated deposit for ${q.number} on signing.`,
      aiSummary: null,
      createdAt: stamp,
      createdById: q.createdById,
      token: publicToken(ctx.newId),
      dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      remindersSent: 0,
    };
    data.invoices.unshift(depositInvoice);
    live.invoice(`Deposit invoice ${depositInvoice.number} drafted`, `$${totals.deposit.toLocaleString()} for ${q.customerName}`, { jobId: job.id, invoiceId: depositInvoice.id });
  }

  data.activities.unshift({
    id: ctx.newId(),
    type: "note",
    subject: `Quote ${q.number} signed by ${input.signerName}`,
    body: `Total $${totals.total.toLocaleString()} · deposit $${totals.deposit.toLocaleString()}`,
    relatedType: "job",
    relatedId: job.id,
    authorId: q.createdById,
    dueAt: null,
    completedAt: stamp,
    createdAt: stamp,
  });
  queueWebhook(data, "proposal.signed", { quoteId: q.id, number: q.number, jobId: job.id, total: totals.total, deposit: totals.deposit }, ctx.newId, ctx.nowIso);
  live.document(`Quote ${q.number} SIGNED by ${input.signerName}`, `$${totals.total.toLocaleString()} · job ${job.number ?? job.id.slice(0, 8)}`, { jobId: job.id, leadId: lead?.id });
  return { quote: q, job, depositInvoice, lead };
}

export function declineQuote(q: Quote, reason: string, ctx: Ctx) {
  if (q.status === "signed") return;
  q.status = "declined";
  q.declinedReason = reason.slice(0, 500);
  q.updatedAt = ctx.nowIso();
  live.document(`Quote ${q.number} declined`, reason.slice(0, 80) || "no reason given", { jobId: q.jobId ?? undefined, leadId: q.leadId ?? undefined });
}

/** Seed a quote's lines from the knocker catalog + inventory (ids or names). */
export function catalogLines(data: AppData, picks: Array<{ productId?: string; serviceId?: string; inventoryId?: string; quantity?: number }>, ctx: Ctx): QuoteLine[] {
  const out: QuoteLine[] = [];
  for (const p of picks) {
    const qty = Number(p.quantity ?? 1);
    if (p.productId) {
      const prod = data.knockProducts.find((x) => x.id === p.productId);
      if (prod) out.push({ id: ctx.newId(), description: prod.name, quantity: qty, unit: "ea", unitPrice: prod.unitPrice, kind: "material" });
    }
    if (p.serviceId) {
      const svc = data.knockServices.find((x) => x.id === p.serviceId);
      if (svc) out.push({ id: ctx.newId(), description: svc.name, quantity: qty, unit: "job", unitPrice: svc.basePrice, kind: "service" });
    }
    if (p.inventoryId) {
      const item = data.inventory.find((x) => x.id === p.inventoryId);
      if (item) out.push({ id: ctx.newId(), description: item.name, quantity: qty, unit: item.unit, unitPrice: Math.round(item.unitCost * 1.35 * 100) / 100, kind: "material" });
    }
  }
  return out;
}

export function companyForDocuments() {
  const p = companyProfile();
  return {
    ...p,
    legalName: process.env.OUTREACH_COMPANY_NAME?.trim() || "BH Contracting LTD.",
    addressLine: process.env.COMPANY_ADDRESS?.trim() || "Halifax Regional Municipality, Nova Scotia",
    hstNumber: process.env.COMPANY_HST_NUMBER?.trim() || "",
  };
}
