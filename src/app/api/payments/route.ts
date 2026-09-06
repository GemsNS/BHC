import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiEmployee } from "@/lib/api-auth";
import { autosendKinds, deliverDocument } from "@/lib/deliver";
import { generateDocument } from "@/lib/documents";
import { applyPayment, createStripeCheckout, ensureInvoiceToken, invoiceBalance, invoicePayUrl, paymentsStatus } from "@/lib/payments";
import { newId, nowIso, readStore, updateStoreAsync } from "@/lib/store";

export async function GET(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const data = await readStore();
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  return NextResponse.json({
    payments: data.payments.filter((p) => !jobId || p.jobId === jobId).slice(0, 200),
    status: paymentsStatus(),
    open: data.invoices
      .filter((i) => i.kind === "invoice" && i.status === "sent")
      .map((i) => ({ id: i.id, number: i.number, customerName: i.customerName, balance: invoiceBalance(data, i), payUrl: i.token ? invoicePayUrl(i) : null })),
  });
}

const schema = z.object({
  action: z.enum(["record", "checkout", "pay_link"]),
  invoiceId: z.string(),
  amount: z.number().positive().optional(),
  method: z.enum(["stripe", "etransfer", "cash", "cheque", "other"]).optional(),
  note: z.string().optional(),
  receivedAt: z.string().optional(),
  sendReceipt: z.boolean().optional(),
});

/**
 * POST { action: "record", invoiceId, amount, method, note? }  manual payment (e-Transfer / cash / cheque)
 * POST { action: "checkout", invoiceId }                       create Stripe Checkout URL for the balance
 * POST { action: "pay_link", invoiceId }                        ensure a public /pay/<token> link exists
 */
export async function POST(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const ctx = { newId, nowIso };

  if (body.action === "record") {
    if (!body.amount || !body.method) return NextResponse.json({ error: "amount + method required" }, { status: 400 });
    let out: ReturnType<typeof applyPayment> | null = null;
    let receipt: { delivery: Awaited<ReturnType<typeof deliverDocument>> } | null = null;
    await updateStoreAsync(async (d) => {
      out = applyPayment(d, { invoiceId: body.invoiceId, amount: body.amount!, method: body.method!, note: body.note, receivedAt: body.receivedAt, provider: "manual" }, ctx);
      if (out.paidInFull && out.invoice && (body.sendReceipt ?? autosendKinds().has("receipt"))) {
        const doc = await generateDocument(d, { kind: "receipt", invoiceId: out.invoice.id }, { ...ctx, createdById: employee.id });
        receipt = { delivery: await deliverDocument(d, doc, ctx) };
      }
    });
    return NextResponse.json({ ...(out as unknown as object), receipt });
  }

  if (body.action === "checkout") {
    let result: { url: string | null; error: string | null } = { url: null, error: "not found" };
    await updateStoreAsync(async (d) => {
      const inv = d.invoices.find((i) => i.id === body.invoiceId);
      if (!inv) return;
      result = await createStripeCheckout(d, inv, ctx);
    });
    return NextResponse.json(result, { status: result.url ? 200 : 400 });
  }

  let link: string | null = null;
  await updateStoreAsync(async (d) => {
    const inv = d.invoices.find((i) => i.id === body.invoiceId);
    if (!inv) return;
    ensureInvoiceToken(inv, newId);
    link = invoicePayUrl(inv);
  });
  return link ? NextResponse.json({ url: link }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
