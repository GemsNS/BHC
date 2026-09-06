import { createHmac, timingSafeEqual } from "crypto";
import { invoiceTotal } from "./customer-touches";
import { live } from "./events";
import { publicToken } from "./numbering";
import { queueWebhook } from "./webhooks";
import { onInvoiceStatusChanged } from "./workflows";
import type { AppData, InvoiceDoc, Payment, PaymentMethod } from "./types";

/**
 * Payments: Stripe Checkout (hosted page, card / Apple Pay / Google Pay) and
 * manual records (e-Transfer, cash, cheque). Applying a payment marks the
 * invoice paid, the job invoiced, and kicks the review-request timer.
 *
 * Env: STRIPE_SECRET_KEY (sk_live_… / sk_test_…), STRIPE_WEBHOOK_SECRET (whsec_…), APP_BASE_URL
 * Stripe Dashboard → Developers → Webhooks → endpoint https://bhcontracting.ca/api/payments/webhook
 *   events: checkout.session.completed, checkout.session.async_payment_succeeded
 */

type Ctx = { newId: () => string; nowIso: () => string };

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function paymentsStatus() {
  return {
    stripe: stripeConfigured(),
    webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
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

/** Create a Stripe Checkout session for the open balance. Returns the hosted URL. */
export async function createStripeCheckout(
  data: AppData,
  inv: InvoiceDoc,
  ctx: Ctx,
  fetcher: typeof fetch = fetch,
): Promise<{ url: string | null; error: string | null }> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return { url: null, error: "STRIPE_SECRET_KEY not set" };
  const balance = invoiceBalance(data, inv);
  if (balance <= 0) return { url: null, error: "Nothing outstanding on this invoice" };
  ensureInvoiceToken(inv, ctx.newId);
  const base = (process.env.APP_BASE_URL ?? "https://bhcontracting.ca").replace(/\/$/, "");
  const job = data.jobs.find((j) => j.id === inv.jobId);
  const lead = job?.leadId ? data.leads.find((l) => l.id === job.leadId) : undefined;
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${base}/pay/${inv.token}?paid=1`);
  params.set("cancel_url", `${base}/pay/${inv.token}`);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "cad");
  params.set("line_items[0][price_data][unit_amount]", String(Math.round(balance * 100)));
  params.set("line_items[0][price_data][product_data][name]", `${inv.number ?? "Invoice"} — ${job?.title ?? inv.customerName}`);
  params.set("metadata[invoiceId]", inv.id);
  params.set("metadata[jobId]", inv.jobId);
  params.set("payment_intent_data[metadata][invoiceId]", inv.id);
  if (lead?.email || inv.customerName.includes("@")) params.set("customer_email", lead?.email ?? inv.customerName);
  try {
    const res = await fetcher("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
    if (!res.ok || !json.url) return { url: null, error: json.error?.message ?? `Stripe HTTP ${res.status}` };
    inv.payUrl = json.url;
    live.payment(`Checkout link created for ${inv.number ?? inv.id.slice(0, 8)}`, `$${balance.toLocaleString()} · ${inv.customerName}`, { invoiceId: inv.id, jobId: inv.jobId });
    return { url: json.url, error: null };
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : "network error" };
  }
}

/** Verify Stripe-Signature (t=…,v1=…) against the raw body. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceSec = 300, now = Date.now()): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;
  if (Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
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
