import { NextResponse } from "next/server";
import { z } from "zod";
import { autosendKinds, deliverDocument } from "@/lib/deliver";
import { generateDocument } from "@/lib/documents";
import { live } from "@/lib/events";
import { storeDataUrl } from "@/lib/media-store";
import { companyForDocuments, declineQuote, markQuoteViewed, quoteTotals, signQuote } from "@/lib/quotes";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { newId, nowIso, readStore, updateStore, updateStoreAsync } from "@/lib/store";

type RouteParams = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

/** Customer-facing: view a quote by its token (marks it viewed). */
export async function GET(_request: Request, { params }: RouteParams) {
  const { token } = await params;
  let payload: Record<string, unknown> | null = null;
  await updateStore((d) => {
    const q = d.quotes.find((x) => x.token === token);
    if (!q) return;
    const wasViewed = q.viewedAt;
    markQuoteViewed(q, { newId, nowIso });
    if (!wasViewed) live.document(`Quote ${q.number} opened by ${q.customerName}`, undefined, { jobId: q.jobId ?? undefined, leadId: q.leadId ?? undefined });
    const c = companyForDocuments();
    payload = {
      quote: {
        number: q.number,
        title: q.title,
        customerName: q.customerName,
        address: q.address,
        scope: q.scope,
        lines: q.lines,
        taxRate: q.taxRate,
        discount: q.discount,
        depositPercent: q.depositPercent,
        validUntil: q.validUntil,
        status: q.status,
        notes: q.notes,
        terms: q.terms,
        signedAt: q.signedAt,
        signerName: q.signerName,
        pdfUrl: q.pdfUrl ? `/api/public/quote/${token}/pdf` : null,
      },
      totals: quoteTotals(q),
      company: { name: c.legalName, phone: c.phone, email: c.email, website: c.website, address: c.addressLine, signer: c.signer },
    };
  });
  if (!payload) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}

const schema = z.object({
  action: z.enum(["sign", "decline"]),
  signerName: z.string().min(2).optional(),
  signerEmail: z.string().optional(),
  signatureDataUrl: z.string().min(50).optional(),
  reason: z.string().optional(),
});

/** Customer signs or declines. */
export async function POST(request: Request, { params }: RouteParams) {
  const { token } = await params;
  const rl = checkRateLimit({ key: `quote-sign:${clientIp(request)}`, limit: 20, windowMs: 3_600_000 });
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const ctx = { newId, nowIso };

  if (body.action === "decline") {
    let ok = false;
    await updateStore((d) => {
      const q = d.quotes.find((x) => x.token === token);
      if (!q) return;
      ok = true;
      declineQuote(q, body.reason ?? "", ctx);
    });
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!body.signerName || !body.signatureDataUrl) return NextResponse.json({ error: "Name and signature required" }, { status: 400 });
  const sigUrl = await storeDataUrl(body.signatureDataUrl, "sig");
  let result: { jobNumber: string | null; depositAmount: number; portalUrl: string | null; total: number } | null = null;
  await updateStoreAsync(async (d) => {
    const q = d.quotes.find((x) => x.token === token);
    if (!q || q.status === "declined" || q.status === "expired") return;
    const r = signQuote(d, q, { signerName: body.signerName!, signerEmail: body.signerEmail, signatureDataUrl: sigUrl }, ctx);
    const base = (process.env.APP_BASE_URL ?? "https://bhcontracting.ca").replace(/\/$/, "");
    // Signed copy + contract + deposit invoice, auto-delivered when policy allows (default: quote copy always)
    const signedDoc = await generateDocument(d, { kind: "quote", quoteId: q.id }, { ...ctx, createdById: q.createdById });
    await deliverDocument(d, signedDoc, ctx, { sms: false });
    const auto = autosendKinds();
    if (auto.has("contract")) {
      const contract = await generateDocument(d, { kind: "contract", jobId: r.job.id }, { ...ctx, createdById: q.createdById });
      await deliverDocument(d, contract, ctx, { sms: false });
    }
    if (r.depositInvoice && (auto.has("invoice") || auto.has("deposit"))) {
      const inv = await generateDocument(d, { kind: "invoice", invoiceId: r.depositInvoice.id }, { ...ctx, createdById: q.createdById });
      await deliverDocument(d, inv, ctx);
    }
    result = {
      jobNumber: r.job.number ?? null,
      depositAmount: quoteTotals(q).deposit,
      total: quoteTotals(q).total,
      portalUrl: r.job.portalToken ? `${base}/portal/${r.job.portalToken}` : null,
    };
  });
  if (!result) return NextResponse.json({ error: "This quote can no longer be signed" }, { status: 409 });
  return NextResponse.json({ ok: true, ...(result as object) });
}
