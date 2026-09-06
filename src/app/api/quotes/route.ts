import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiEmployee } from "@/lib/api-auth";
import { deliverDocument } from "@/lib/deliver";
import { generateDocument } from "@/lib/documents";
import { catalogLines, createQuote, declineQuote, quotePublicUrl, quoteTotals, signQuote, updateQuote } from "@/lib/quotes";
import { storeDataUrl } from "@/lib/media-store";
import { newId, nowIso, readStore, updateStore, updateStoreAsync } from "@/lib/store";
import type { Quote } from "@/lib/types";

const base = () => (process.env.APP_BASE_URL ?? "https://bhcontracting.ca").replace(/\/$/, "");

export async function GET(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const data = await readStore();
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  const id = url.searchParams.get("id");
  const quotes = data.quotes.filter((q) => (!jobId || q.jobId === jobId) && (!id || q.id === id));
  return NextResponse.json({
    quotes: quotes.map((q) => ({ ...q, totals: quoteTotals(q), publicUrl: quotePublicUrl(q, base()) })),
    catalog: { products: data.knockProducts, services: data.knockServices, inventory: data.inventory },
  });
}

const lineSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().nonnegative().optional(),
  unit: z.string().optional(),
  unitPrice: z.number().optional(),
  kind: z.enum(["material", "labour", "service", "other"]).optional(),
});

const bodySchema = z.object({
  action: z.enum(["create", "update", "send", "generate_pdf", "sign", "decline", "duplicate", "add_catalog"]),
  id: z.string().optional(),
  quote: z
    .object({
      jobId: z.string().nullable().optional(),
      leadId: z.string().nullable().optional(),
      customerName: z.string().optional(),
      customerEmail: z.string().optional(),
      customerPhone: z.string().optional(),
      address: z.string().optional(),
      title: z.string().optional(),
      scope: z.string().optional(),
      lines: z.array(lineSchema).optional(),
      taxRate: z.number().optional(),
      discount: z.number().optional(),
      depositPercent: z.number().optional(),
      validDays: z.number().optional(),
      validUntil: z.string().nullable().optional(),
      notes: z.string().optional(),
      terms: z.string().optional(),
    })
    .optional(),
  picks: z.array(z.object({ productId: z.string().optional(), serviceId: z.string().optional(), inventoryId: z.string().optional(), quantity: z.number().optional() })).optional(),
  signerName: z.string().optional(),
  signerEmail: z.string().optional(),
  signatureDataUrl: z.string().optional(),
  reason: z.string().optional(),
  channels: z.object({ email: z.boolean().optional(), sms: z.boolean().optional() }).optional(),
});

export async function POST(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const ctx = { newId, nowIso };

  switch (body.action) {
    case "create": {
      let quote: Quote | null = null;
      await updateStore((d) => {
        quote = createQuote(d, { ...(body.quote ?? {}), createdById: employee.id }, ctx);
        if (body.picks?.length) quote.lines.push(...catalogLines(d, body.picks, ctx));
      });
      return NextResponse.json({ quote }, { status: 201 });
    }
    case "update": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      let quote: Quote | null = null;
      await updateStore((d) => {
        quote = updateQuote(d, body.id!, (body.quote ?? {}) as Partial<Quote>, ctx);
      });
      return quote ? NextResponse.json({ quote }) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    case "add_catalog": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      let quote: Quote | undefined;
      await updateStore((d) => {
        quote = d.quotes.find((q) => q.id === body.id);
        if (quote && quote.status !== "signed") quote.lines.push(...catalogLines(d, body.picks ?? [], ctx));
      });
      return quote ? NextResponse.json({ quote }) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    case "duplicate": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      let quote: Quote | null = null;
      await updateStore((d) => {
        const src = d.quotes.find((q) => q.id === body.id);
        if (!src) return;
        quote = createQuote(d, { ...src, lines: src.lines.map((l) => ({ ...l, id: undefined })), createdById: employee.id, validDays: 30 }, ctx);
      });
      return quote ? NextResponse.json({ quote }, { status: 201 }) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    case "generate_pdf":
    case "send": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      let out: { quote: Quote; documentId: string; delivery?: Awaited<ReturnType<typeof deliverDocument>>; publicUrl: string } | null = null;
      await updateStoreAsync(async (d) => {
        const q = d.quotes.find((x) => x.id === body.id);
        if (!q) return;
        const doc = await generateDocument(d, { kind: "quote", quoteId: q.id }, { ...ctx, createdById: employee.id });
        let delivery;
        if (body.action === "send") {
          delivery = await deliverDocument(d, doc, ctx, { email: body.channels?.email, sms: body.channels?.sms });
        }
        out = { quote: q, documentId: doc.id, delivery, publicUrl: quotePublicUrl(q, base()) };
      });
      return out ? NextResponse.json(out) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    case "sign": {
      // Staff-side signing (customer signed on paper / in person)
      if (!body.id || !body.signerName || !body.signatureDataUrl) return NextResponse.json({ error: "id, signerName, signatureDataUrl required" }, { status: 400 });
      const sigUrl = await storeDataUrl(body.signatureDataUrl, "sig");
      let result: ReturnType<typeof signQuote> | null = null;
      await updateStoreAsync(async (d) => {
        const q = d.quotes.find((x) => x.id === body.id);
        if (!q) return;
        result = signQuote(d, q, { signerName: body.signerName!, signerEmail: body.signerEmail, signatureDataUrl: sigUrl }, ctx);
        await generateDocument(d, { kind: "quote", quoteId: q.id }, { ...ctx, createdById: employee.id });
      });
      return result ? NextResponse.json(result) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    case "decline": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      await updateStore((d) => {
        const q = d.quotes.find((x) => x.id === body.id);
        if (q) declineQuote(q, body.reason ?? "", ctx);
      });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
