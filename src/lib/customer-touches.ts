import { companyProfile } from "./ad-classify";
import { live } from "./events";
import { isOptedOut, sendPolicy } from "./outreach-send";
import type { AppData, InvoiceDoc, Job, Lead, OutreachKind, OutreachQueueItem } from "./types";

/**
 * Post-sale customer touches that run themselves:
 *   review_requests   paid invoice + 7 days  → Google review link
 *   referral_asks     completed job + 14 days → tracked referral link
 *   payment_reminders sent invoice at 7/14/30 days → pay link
 *
 * All go through the outreach queue (email or SMS), so the same approval /
 * auto-send policy, opt-outs, quiet hours and daily cap apply.
 *
 * Env: REVIEW_URL (Google "write a review" link), APP_BASE_URL,
 *      OUTREACH_AUTOSEND_TOUCHES=1 to auto-approve these touches.
 */

type Ctx = { newId: () => string; nowIso: () => string; now?: number };

const DAY = 86_400_000;

function env(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const v = process.env?.[name]?.trim();
  return v || undefined;
}

export function appBaseUrl(): string {
  return (env("APP_BASE_URL") ?? "https://bhcontracting.ca").replace(/\/$/, "");
}

export function invoiceTotal(inv: InvoiceDoc): number {
  return inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
}

export function money(n: number): string {
  return `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Customer contact for a job: the linked lead, else nothing we can message. */
export function customerForJob(data: AppData, job: Job): { name: string; email: string; phone: string; lead: Lead | null } {
  const lead = job.leadId ? data.leads.find((l) => l.id === job.leadId) ?? null : null;
  return {
    name: lead?.name ?? job.customerName,
    email: lead?.email ?? "",
    phone: lead?.phone ?? "",
    lead,
  };
}

export function makeReferralCode(name: string, newId: () => string): string {
  const base = name.replace(/[^a-z]/gi, "").slice(0, 4).toUpperCase() || "BHC";
  return `${base}-${newId().replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

function touchExists(data: AppData, kind: OutreachKind, ref: { jobId?: string | null; invoiceId?: string | null }, extra?: (o: OutreachQueueItem) => boolean): boolean {
  return data.outreachQueue.some(
    (o) =>
      o.kind === kind &&
      o.status !== "cancelled" &&
      (ref.invoiceId ? o.invoiceId === ref.invoiceId : true) &&
      (ref.jobId ? o.jobId === ref.jobId : true) &&
      (!extra || extra(o)),
  );
}

function queueTouch(
  data: AppData,
  ctx: Ctx,
  input: {
    kind: OutreachKind;
    customer: { name: string; email: string; phone: string; lead: Lead | null };
    subject: string;
    email: string;
    sms: string;
    jobId?: string | null;
    invoiceId?: string | null;
    preferSms?: boolean;
  },
): OutreachQueueItem | null {
  const { customer } = input;
  const policy = sendPolicy();
  const auto = env("OUTREACH_AUTOSEND_TOUCHES") === "1";
  const useSms = Boolean(customer.phone) && (input.preferSms || !customer.email);
  const channel: "sms" | "email" | null = useSms ? "sms" : customer.email ? "email" : null;
  if (!channel) return null;
  const dest = channel === "sms" ? customer.phone : customer.email;
  if (isOptedOut(data, channel, dest)) return null;
  const item: OutreachQueueItem = {
    id: ctx.newId(),
    leadId: customer.lead?.id ?? null,
    prospectName: customer.name,
    prospectEmail: customer.email,
    prospectPhone: customer.phone,
    channel,
    subject: input.subject,
    message: channel === "sms" ? input.sms : input.email,
    status: auto && (policy.autosend.has(channel) || true) ? "approved" : "pending_approval",
    workflowRunId: null,
    scheduledAt: ctx.nowIso(),
    sentAt: null,
    createdAt: ctx.nowIso(),
    kind: input.kind,
    jobId: input.jobId ?? null,
    invoiceId: input.invoiceId ?? null,
  };
  data.outreachQueue.unshift(item);
  live.outreach(`${labelFor(input.kind)} drafted for ${customer.name}`, `${channel}${item.status === "approved" ? " · auto-approved" : " · awaiting approval"}`, { jobId: input.jobId ?? undefined, leadId: item.leadId ?? undefined });
  return item;
}

function labelFor(kind: OutreachKind): string {
  return kind === "review" ? "Review request" : kind === "referral" ? "Referral ask" : kind === "payment_reminder" ? "Payment reminder" : "Touch";
}

/* ------------------------------ review ------------------------------ */

export function runReviewRequests(data: AppData, ctx: Ctx): { created: number; summary: string } {
  const url = env("REVIEW_URL");
  if (!url) return { created: 0, summary: "Review requests: REVIEW_URL not set (Google 'write a review' link) — skipped." };
  const now = ctx.now ?? Date.now();
  const delay = Number(env("REVIEW_DELAY_DAYS") ?? "7") || 7;
  const p = companyProfile();
  let created = 0;
  for (const inv of data.invoices) {
    if (inv.kind !== "invoice" || inv.status !== "paid") continue;
    const paidAt = inv.paidAt ?? inv.createdAt;
    if (now - new Date(paidAt).getTime() < delay * DAY) continue;
    const job = data.jobs.find((j) => j.id === inv.jobId);
    if (!job) continue;
    if (touchExists(data, "review", { jobId: job.id })) continue;
    const customer = customerForJob(data, job);
    const first = customer.name.split(/\s+/)[0] || "there";
    const item = queueTouch(data, ctx, {
      kind: "review",
      customer,
      jobId: job.id,
      invoiceId: inv.id,
      preferSms: true,
      subject: `Thanks for choosing ${p.shortName} — quick favour?`,
      email: `Hi ${first},\n\nThanks again for having us do the ${job.title.toLowerCase()}. It was a pleasure working with you.\n\nIf you were happy with the work, a short Google review helps a small local crew like ours more than anything:\n${url}\n\nIf anything isn't right, reply to this email and I'll make it right first.\n\n${p.signer}\n${p.name} · ${[p.phone, p.email].filter(Boolean).join(" · ")}`,
      sms: `Hi ${first}, ${p.signer} from ${p.shortName}. Thanks again for the ${job.title.toLowerCase()}! If you were happy with the work, a quick Google review means a lot to us: ${url} — Reply STOP to opt out.`,
    });
    if (item) created += 1;
  }
  return { created, summary: `Review requests: ${created} queued.` };
}

/* ----------------------------- referral ----------------------------- */

export function runReferralAsks(data: AppData, ctx: Ctx): { created: number; summary: string } {
  const now = ctx.now ?? Date.now();
  const delay = Number(env("REFERRAL_DELAY_DAYS") ?? "14") || 14;
  const p = companyProfile();
  let created = 0;
  for (const job of data.jobs) {
    if (job.status !== "completed" && job.status !== "invoiced") continue;
    const done = data.invoices.filter((i) => i.jobId === job.id).map((i) => new Date(i.paidAt ?? i.createdAt).getTime()).sort((a, b) => b - a)[0] ?? new Date(job.createdAt).getTime();
    if (now - done < delay * DAY) continue;
    if (touchExists(data, "referral", { jobId: job.id })) continue;
    const customer = customerForJob(data, job);
    if (!customer.lead) continue;
    if (!customer.lead.referralCode) customer.lead.referralCode = makeReferralCode(customer.name, ctx.newId);
    const link = `${appBaseUrl()}/r/${customer.lead.referralCode}`;
    const first = customer.name.split(/\s+/)[0] || "there";
    const item = queueTouch(data, ctx, {
      kind: "referral",
      customer,
      jobId: job.id,
      subject: `Know anyone who needs exterior work? — ${p.shortName}`,
      email: `Hi ${first},\n\nHope the ${job.title.toLowerCase()} is holding up well. Most of our work comes from people like you telling a neighbour or friend.\n\nIf you know anyone thinking about siding, decks, windows or exterior repairs, send them this link — it tells us they came from you, and we'll look after them:\n${link}\n\nThanks again,\n${p.signer}\n${p.name} · ${[p.phone, p.email].filter(Boolean).join(" · ")}`,
      sms: `Hi ${first}, ${p.signer} from ${p.shortName}. If you know anyone who needs siding, decks or exterior work, this link tells us they came from you: ${link} — thanks! Reply STOP to opt out.`,
    });
    if (item) created += 1;
  }
  return { created, summary: `Referral asks: ${created} queued.` };
}

/* --------------------------- payment reminders --------------------------- */

const REMINDER_DAYS = [7, 14, 30];

export function runPaymentReminders(data: AppData, ctx: Ctx): { created: number; summary: string } {
  const now = ctx.now ?? Date.now();
  const p = companyProfile();
  let created = 0;
  for (const inv of data.invoices) {
    if (inv.kind !== "invoice" || inv.status !== "sent") continue;
    const since = new Date(inv.sentAt ?? inv.createdAt).getTime();
    const ageDays = Math.floor((now - since) / DAY);
    const sent = inv.remindersSent ?? 0;
    const due = REMINDER_DAYS.filter((d) => ageDays >= d).length;
    if (due <= sent) continue;
    const job = data.jobs.find((j) => j.id === inv.jobId);
    if (!job) continue;
    const customer = customerForJob(data, job);
    const total = invoiceTotal(inv) - (inv.paidAmount ?? 0);
    const payUrl = inv.payUrl ?? (inv.token ? `${appBaseUrl()}/pay/${inv.token}` : "");
    const first = customer.name.split(/\s+/)[0] || "there";
    const n = sent + 1;
    const tone = n === 1 ? "Just a friendly reminder" : n === 2 ? "Following up again" : "This is our third notice";
    const item = queueTouch(data, ctx, {
      kind: "payment_reminder",
      customer,
      jobId: job.id,
      invoiceId: inv.id,
      subject: `${inv.number ?? "Invoice"} for ${job.title} — ${money(total)} outstanding`,
      email: `Hi ${first},\n\n${tone} that ${inv.number ?? "our invoice"} for the ${job.title.toLowerCase()} (${money(total)}) is still outstanding.\n\n${payUrl ? `Pay online: ${payUrl}\n` : ""}Interac e-Transfer works too: ${p.email}\n\nIf you've already sent it, thank you — please ignore this. Any questions, just reply.\n\n${p.signer}\n${p.name} · ${[p.phone, p.email].filter(Boolean).join(" · ")}`,
      sms: `Hi ${first}, ${p.signer} from ${p.shortName}. ${tone}: ${inv.number ?? "your invoice"} (${money(total)}) is still outstanding.${payUrl ? ` Pay here: ${payUrl}` : ""} e-Transfer: ${p.email}. Thanks! Reply STOP to opt out.`,
    });
    if (item) {
      inv.remindersSent = n;
      created += 1;
    }
  }
  return { created, summary: `Payment reminders: ${created} queued.` };
}

export function runCustomerTouches(
  data: AppData,
  action: "review_requests" | "referral_asks" | "payment_reminders",
  ctx: Ctx,
): { created: number; summary: string } {
  if (action === "review_requests") return runReviewRequests(data, ctx);
  if (action === "referral_asks") return runReferralAsks(data, ctx);
  return runPaymentReminders(data, ctx);
}
