import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiEmployee } from "@/lib/api-auth";
import { autosendKinds, deliverDocument } from "@/lib/deliver";
import { generateDocument, type GenerateInput } from "@/lib/documents";
import { newId, nowIso, readStore, updateStoreAsync } from "@/lib/store";
import type { JobDocument } from "@/lib/types";

export async function GET(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const data = await readStore();
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  const docs = data.documents.filter((d) => !jobId || d.jobId === jobId).slice(0, 200);
  return NextResponse.json({ documents: docs, autosend: [...autosendKinds()] });
}

const schema = z.object({
  action: z.enum(["generate", "send"]),
  id: z.string().optional(),
  kind: z.enum(["quote", "contract", "invoice", "receipt", "job_report"]).optional(),
  jobId: z.string().optional(),
  quoteId: z.string().optional(),
  invoiceId: z.string().optional(),
  entryIds: z.array(z.string()).optional(),
  title: z.string().optional(),
  send: z.boolean().optional(),
  channels: z.object({ email: z.boolean().optional(), sms: z.boolean().optional() }).optional(),
  to: z.object({ email: z.string().optional(), phone: z.string().optional() }).optional(),
  note: z.string().optional(),
});

/**
 * POST { action: "generate", kind, jobId|quoteId|invoiceId, send? }  → PDF (+ delivery)
 * POST { action: "send", id, channels?, to?, note? }                → deliver an existing document
 */
export async function POST(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const ctx = { newId, nowIso };

  if (body.action === "generate") {
    if (!body.kind) return NextResponse.json({ error: "kind required" }, { status: 400 });
    let input: GenerateInput;
    if (body.kind === "quote") {
      if (!body.quoteId) return NextResponse.json({ error: "quoteId required" }, { status: 400 });
      input = { kind: "quote", quoteId: body.quoteId };
    } else if (body.kind === "contract") {
      if (!body.jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
      input = { kind: "contract", jobId: body.jobId };
    } else if (body.kind === "invoice" || body.kind === "receipt") {
      if (!body.invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
      input = { kind: body.kind, invoiceId: body.invoiceId };
    } else {
      if (!body.jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
      input = { kind: "job_report", jobId: body.jobId, entryIds: body.entryIds, title: body.title };
    }
    let doc: JobDocument | null = null;
    let delivery: Awaited<ReturnType<typeof deliverDocument>> | null = null;
    let error: string | null = null;
    await updateStoreAsync(async (d) => {
      try {
        doc = await generateDocument(d, input, { ...ctx, createdById: employee.id });
        const auto = body.send ?? autosendKinds().has(body.kind!);
        if (auto) delivery = await deliverDocument(d, doc, ctx, { email: body.channels?.email, sms: body.channels?.sms, to: body.to, note: body.note });
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    });
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ document: doc, delivery }, { status: 201 });
  }

  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  let delivery: Awaited<ReturnType<typeof deliverDocument>> | null = null;
  let found = false;
  await updateStoreAsync(async (d) => {
    const doc = d.documents.find((x) => x.id === body.id);
    if (!doc) return;
    found = true;
    delivery = await deliverDocument(d, doc, ctx, { email: body.channels?.email, sms: body.channels?.sms, to: body.to, note: body.note });
  });
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ delivery });
}
