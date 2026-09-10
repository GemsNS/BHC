import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiEmployee } from "@/lib/api-auth";
import { autosendKinds, deliverDocument } from "@/lib/deliver";
import {
  deleteDocument,
  generateDocument,
  uploadDocument,
  type GenerateInput,
} from "@/lib/documents";
import { newId, nowIso, readStore, updateStoreAsync } from "@/lib/store";
import type { DocumentKind, JobDocument } from "@/lib/types";

export async function GET(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const data = await readStore();
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  const docs = data.documents.filter((d) => !jobId || d.jobId === jobId).slice(0, 200);
  return NextResponse.json({ documents: docs, autosend: [...autosendKinds()] });
}

const jsonSchema = z.object({
  action: z.enum(["generate", "send", "delete"]),
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
 * POST multipart { action: "upload", jobId, kind, title?, file } → attach uploaded PDF/image
 * POST JSON     { action: "generate", kind, jobId|quoteId|invoiceId, send? }
 * POST JSON     { action: "send", id, channels?, to?, note? }
 * POST JSON     { action: "delete", id }  → remove document + media + audit
 */
export async function POST(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const ctx = { newId, nowIso };
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const action = String(form.get("action") || "upload");
    if (action !== "upload") {
      return NextResponse.json({ error: "multipart posts only support action=upload" }, { status: 400 });
    }
    const jobId = String(form.get("jobId") || "");
    const kind = String(form.get("kind") || "") as DocumentKind;
    const title = form.get("title") ? String(form.get("title")) : undefined;
    const invoiceId = form.get("invoiceId") ? String(form.get("invoiceId")) : null;
    const file = form.get("file");
    if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
    if (!["contract", "invoice", "quote", "receipt", "job_report"].includes(kind)) {
      return NextResponse.json({ error: "kind must be contract, invoice, quote, receipt, or job_report" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    let doc: JobDocument | null = null;
    let error: string | null = null;
    await updateStoreAsync(async (d) => {
      try {
        doc = await uploadDocument(
          d,
          {
            jobId,
            kind: kind as "contract" | "invoice" | "quote" | "receipt" | "job_report",
            title,
            buffer,
            fileName: file.name || "upload.pdf",
            mimeType: file.type || "application/octet-stream",
            invoiceId,
          },
          { ...ctx, createdById: employee.id },
        );
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    });
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ document: doc }, { status: 201 });
  }

  const parsed = jsonSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

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
        if (auto) {
          delivery = await deliverDocument(d, doc, ctx, {
            email: body.channels?.email,
            sms: body.channels?.sms,
            to: body.to,
            note: body.note,
          });
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    });
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ document: doc, delivery }, { status: 201 });
  }

  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    let deleted: JobDocument | null = null;
    let error: string | null = null;
    await updateStoreAsync(async (d) => {
      try {
        const result = await deleteDocument(d, body.id!, { ...ctx, createdById: employee.id });
        deleted = result.deleted;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    });
    if (error) {
      const status = error === "Document not found" ? 404 : 400;
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json({ deleted });
  }

  // send
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  let delivery: Awaited<ReturnType<typeof deliverDocument>> | null = null;
  let found = false;
  await updateStoreAsync(async (d) => {
    const doc = d.documents.find((x) => x.id === body.id);
    if (!doc) return;
    found = true;
    delivery = await deliverDocument(d, doc, ctx, {
      email: body.channels?.email,
      sms: body.channels?.sms,
      to: body.to,
      note: body.note,
    });
  });
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ delivery });
}
