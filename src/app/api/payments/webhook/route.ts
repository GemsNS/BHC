import { NextResponse } from "next/server";
import { autosendKinds, deliverDocument } from "@/lib/deliver";
import { generateDocument } from "@/lib/documents";
import { live } from "@/lib/events";
import { applyPayment, verifyStripeSignature } from "@/lib/payments";
import { newId, nowIso, updateStoreAsync } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook. Dashboard → Developers → Webhooks → Add endpoint:
 *   https://bhcontracting.ca/api/payments/webhook
 *   events: checkout.session.completed, checkout.session.async_payment_succeeded
 * Put the signing secret in STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not set" }, { status: 503 });
  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const type = event.type ?? "";
  const obj = event.data?.object ?? {};
  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ received: true, ignored: type });
  }
  if (obj.payment_status && obj.payment_status !== "paid") {
    return NextResponse.json({ received: true, pending: true });
  }
  const invoiceId = (obj.metadata as Record<string, string> | undefined)?.invoiceId;
  const amount = Number(obj.amount_total ?? 0) / 100;
  const providerId = String(obj.payment_intent ?? obj.id ?? event.id ?? "");
  if (!invoiceId || !amount) {
    live.payment("Stripe payment without invoice metadata", `${amount} · ${providerId}`);
    return NextResponse.json({ received: true, unmatched: true });
  }
  let duplicate = false;
  await updateStoreAsync(async (d) => {
    const r = applyPayment(d, { invoiceId, amount, method: "stripe", provider: "stripe", providerId, note: `Stripe checkout ${String(obj.id ?? "")}` }, { newId, nowIso });
    duplicate = r.duplicate;
    if (!r.duplicate && r.paidInFull && r.invoice && autosendKinds().has("receipt")) {
      const doc = await generateDocument(d, { kind: "receipt", invoiceId: r.invoice.id }, { newId, nowIso, createdById: "emp-admin" });
      await deliverDocument(d, doc, { newId, nowIso });
    }
  });
  return NextResponse.json({ received: true, duplicate });
}
