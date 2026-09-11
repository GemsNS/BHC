import { NextResponse } from "next/server";
import { invoiceTotal } from "@/lib/customer-touches";
import { renderInvoicePdf } from "@/lib/documents";
import { createStripeCheckout, invoiceBalance, paymentsStatus } from "@/lib/payments";
import { companyForDocuments } from "@/lib/quotes";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { newId, nowIso, readStore } from "@/lib/store";

type RouteParams = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

/** Customer-facing invoice view. ?pdf=1 streams the PDF. */
export async function GET(request: Request, { params }: RouteParams) {
  const { token } = await params;
  const data = await readStore();
  const inv = data.invoices.find((i) => i.token === token);
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (new URL(request.url).searchParams.get("pdf") === "1") {
    const buf = await renderInvoicePdf(data, inv, { receipt: inv.status === "paid" });
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${inv.number ?? "invoice"}.pdf"` } });
  }
  const job = data.jobs.find((j) => j.id === inv.jobId);
  const c = companyForDocuments();
  const status = paymentsStatus();
  return NextResponse.json(
    {
      invoice: { number: inv.number, status: inv.status, customerName: inv.customerName, lines: inv.lines, total: invoiceTotal(inv), balance: invoiceBalance(data, inv), dueAt: inv.dueAt, createdAt: inv.createdAt, notes: inv.notes, aiSummary: inv.aiSummary },
      job: job ? { title: job.title, address: job.address, number: job.number } : null,
      company: { name: c.legalName, phone: c.phone, email: c.email, website: c.website, address: c.addressLine },
      payments: data.payments.filter((p) => p.invoiceId === inv.id).map((p) => ({ amount: p.amount, method: p.method, receivedAt: p.receivedAt })),
      canPayOnline: status.stripe,
      etransferEmail: status.etransferEmail,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Card checkout disabled — e-Transfer / cheque only. */
export async function POST(request: Request, { params }: RouteParams) {
  const { token } = await params;
  const rl = checkRateLimit({ key: `pay:${clientIp(request)}`, limit: 30, windowMs: 3_600_000 });
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  const data = await readStore();
  const inv = data.invoices.find((i) => i.token === token);
  if (!inv) return NextResponse.json({ url: null, error: "Not found" }, { status: 404 });
  const result = await createStripeCheckout(data, inv, { newId, nowIso });
  return NextResponse.json(result, { status: 410 });
}
