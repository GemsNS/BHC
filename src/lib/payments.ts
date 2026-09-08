import { invoiceTotal } from "./customer-touches";
import { live } from "./events";
import { publicToken } from "./numbering";
import { queueWebhook } from "./webhooks";
import { onInvoiceStatusChanged } from "./workflows";
import type { AppData, InvoiceDoc, Payment, PaymentMethod } from "./types";

/**
 * Payments: e-Transfer / cash / cheque (manual + IMAP auto-match).
 * Stripe Checkout was removed from the live workflow — card pay is disabled.
 *
 * Env (optional legacy, ignored): STRIPE_* — kept out of the path via stripeConfigured().
 * Active: ETRANSFER_EMAIL / OUTREACH_REPLY_EMAIL for Interac matching.
 */

type Ctx = { newId: () => string; nowIso: () => string };

/** Stripe is fully cut from the workflow. Always false. */
export function stripeConfigured(): boolean {
  return false;
}

export function paymentsStatus() {
  return {
    stripe: false,
    webhookSecret: false,
    etransferEmail: process.env.ETRANSFER_EMAIL?.trim() || process.env.OUTREACH_REPLY_EMAIL?.trim() || process.env.CONTACT_TO_EMAIL?.trim() || null,
  };
}

export function ensureInvoiceToken(inv: InvoiceDoc, newId: () => string): string {
  if (!inv.token) inv.token = publicToken(newId);
  return inv.token;
}

export function invoiceBalance(data: AppData, inv: InvoiceDoc): number {
  const paid = data.payments.filter((p) => p.invoiceId === inv.id && p.status === "succeeded").reduce((s, p) => s + p.amount, 0);
  return Math.max(0, Math.round((invoiceTotal(inv) - paid) * 100) / 100);
}

export function invoicePayUrl(inv: InvoiceDoc, base = process.env.APP_BASE_URL ?? "https://bhcontracting.ca"): string {
  return `${base.replace(/\/$/, "")}/pay/${inv.token}`;
}

/** Stripe Checkout — permanently disabled (cut from workflow). */
export async function createStripeCheckout(
  _data: AppData,
  _inv: InvoiceDoc,
  _ctx: Ctx,
  _fetcher: typeof fetch = fetch,
): Promise<{ url: string | null; error: string | null }> {
  return {
    url: null,
    error: "Card payments are disabled. Use e-Transfer or record a manual payment.",
  };
}

/** Stripe signature verify — unused while Stripe is cut. Always false. */
export function verifyStripeSignature(
  _rawBody: string,
  _header: string | null,
  _secret: string,
  _toleranceSec = 300,
  _now = Date.now(),
): boolean {
  return false;
}

/**
 * Record a payment and roll its effects through the store:
 * invoice paid (when balance hits 0) → job invoiced → workflows + webhooks.
 */
export function applyPayment(
  data: AppData,
  input: { invoiceId: string; amount: number; method: PaymentMethod; provider?: string | null; providerId?: string | null; note?: string; receivedAt?: string },
  ctx: Ctx,
): { payment: Payment; invoice: InvoiceDoc | null; paidInFull: boolean; duplicate: boolean } {
  const existing = input.providerId ? data.payments.find((p) => p.providerId === input.providerId) : undefined;
  if (existing) {
    return { payment: existing, invoice: data.invoices.find((i) => i.id === existing.invoiceId) ?? null, paidInFull: false, duplicate: true };
  }
  const inv = data.invoices.find((i) => i.id === input.invoiceId) ?? null;
  const payment: Payment = {
    id: ctx.newId(),
    invoiceId: inv?.id ?? input.invoiceId,
    jobId: inv?.jobId ?? null,
    amount: Math.round(input.amount * 100) / 100,
    currency: "CAD",
    method: input.method,
    provider: input.provider ?? null,
    providerId: input.providerId ?? null,
    status: "succeeded",
    receivedAt: input.receivedAt ?? ctx.nowIso(),
    note: input.note ?? "",
    createdAt: ctx.nowIso(),
  };
  data.payments.unshift(payment);
  let paidInFull = false;
  if (inv) {
    inv.paidAmount = Math.round(((inv.paidAmount ?? 0) + payment.amount) * 100) / 100;
    const balance = invoiceBalance(data, inv);
    if (balance <= 0.005) {
      paidInFull = true;
      if (inv.status !== "paid") {
        inv.status = "paid";
        inv.paidAt = payment.receivedAt;
        onInvoiceStatusChanged(data, inv, "emp-admin");
        const job = data.jobs.find((j) => j.id === inv.jobId);
        if (job && (job.status === "completed" || job.status === "invoiced")) job.status = "invoiced";
        queueWebhook(data, "invoice.status_changed", { invoiceId: inv.id, jobId: inv.jobId, to: "paid", amount: payment.amount, method: input.method }, ctx.newId, ctx.nowIso);
      }
    }
    data.activities.unshift({
      id: ctx.newId(),
      type: "note",
      subject: `Payment ${payment.amount.toLocaleString("en-CA", { style: "currency", currency: "CAD" })} via ${input.method}`,
      body: `${inv.number ?? "Invoice"} · ${paidInFull ? "paid in full" : `balance $${balance.toLocaleString()}`}${input.note ? ` · ${input.note}` : ""}`,
      relatedType: "job",
      relatedId: inv.jobId,
      authorId: "emp-admin",
      dueAt: null,
      completedAt: ctx.nowIso(),
      createdAt: ctx.nowIso(),
    });
  }
  live.payment(
    `Payment received: $${payment.amount.toLocaleString()} (${input.method})`,
    inv ? `${inv.number ?? inv.id.slice(0, 8)} · ${inv.customerName}${paidInFull ? " · PAID IN FULL" : ""}` : "unmatched invoice",
    { invoiceId: inv?.id, jobId: inv?.jobId },
  );
  return { payment, invoice: inv, paidInFull, duplicate: false };
}

/**
 * Interac e-Transfer notifications land in the mailbox; match amount to an
 * open invoice for a customer with the same name/email. Returns matches only
 * when unambiguous — otherwise a task is created for a human.
 */
export function detectEtransfer(mail: { subject: string; text: string; fromAddress: string }): { amount: number; senderName: string } | null {
  const s = `${mail.subject}\n${mail.text}`;
  if (!/interac|e-?transfer/i.test(s)) return null;
  const amt = s.match(/\$\s?([\d,]+\.\d{2})/);
  if (!amt) return null;
  const amount = Number(amt[1].replace(/,/g, ""));
  const name =
    s.match(/([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3})\s+(?:has\s+)?sent you/)?.[1] ??
    s.match(/(?:from|received from)\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3})/)?.[1] ??
    "";
  return Number.isFinite(amount) && amount > 0 ? { amount, senderName: name } : null;
}

export function matchEtransferToInvoice(data: AppData, et: { amount: number; senderName: string }): InvoiceDoc | null {
  const open = data.invoices.filter((i) => i.kind === "invoice" && i.status === "sent");
  const byAmount = open.filter((i) => Math.abs(invoiceBalance(data, i) - et.amount) < 0.01);
  if (byAmount.length === 1) return byAmount[0];
  if (byAmount.length > 1 && et.senderName) {
    const n = et.senderName.toLowerCase();
    const byName = byAmount.filter((i) => i.customerName.toLowerCase().includes(n.split(" ")[0]));
    if (byName.length === 1) return byName[0];
  }
  return null;
}
