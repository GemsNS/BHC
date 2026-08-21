import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import type { InvoiceDoc, InvoiceLine } from "@/lib/types";
import { summarizeProgress } from "@/lib/ai-summarize";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    invoices: data.invoices,
    jobs: data.jobs,
    progress: data.jobProgress,
    materials: data.materials,
    employees: data.employees,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const schema = z.object({
    jobId: z.string(),
    kind: z.enum(["invoice", "full_report"]),
    createdById: z.string(),
    customerName: z.string().optional(),
    notes: z.string().optional(),
    includeProgress: z.boolean().optional(),
    progressEntryIds: z.array(z.string()).optional(),
    lines: z
      .array(
        z.object({
          description: z.string(),
          quantity: z.number(),
          unitPrice: z.number(),
        }),
      )
      .optional(),
    autoLinesFromMaterials: z.boolean().optional(),
    runAi: z.boolean().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = await readStore();
  const job = data.jobs.find((j) => j.id === parsed.data.jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const lines: InvoiceLine[] = (parsed.data.lines || []).map((l) => ({
    id: newId(),
    ...l,
  }));
  if (parsed.data.autoLinesFromMaterials) {
    for (const m of data.materials.filter((x) => x.jobId === job.id)) {
      lines.push({
        id: newId(),
        description: m.description,
        quantity: m.quantity,
        unitPrice: m.unitCost,
      });
    }
  }
  if (!lines.length) {
    lines.push({
      id: newId(),
      description: `${job.title} — contract progress`,
      quantity: 1,
      unitPrice: job.contractValue || job.estimatedValue || 0,
    });
  }

  const includeProgress =
    parsed.data.kind === "full_report" || Boolean(parsed.data.includeProgress);
  const progressEntryIds =
    parsed.data.progressEntryIds ||
    (includeProgress
      ? data.jobProgress.filter((p) => p.jobId === job.id).map((p) => p.id)
      : []);

  let aiSummary: string | null = null;
  if (parsed.data.runAi && includeProgress) {
    const entries = data.jobProgress.filter((p) =>
      progressEntryIds.includes(p.id),
    );
    const result = await summarizeProgress({
      jobTitle: job.title,
      customerName: job.customerName,
      notes: entries.map((e) => e.notes),
      imageCount: entries.reduce((s, e) => s + e.imageDataUrls.length, 0),
    });
    aiSummary = result.summary;
  }

  const doc: InvoiceDoc = {
    id: newId(),
    jobId: job.id,
    kind: parsed.data.kind,
    status: "draft",
    customerName: parsed.data.customerName || job.customerName,
    lines,
    includeProgress,
    progressEntryIds,
    notes: parsed.data.notes || "",
    aiSummary,
    createdAt: nowIso(),
    createdById: parsed.data.createdById,
  };

  await updateStore((d) => {
    d.invoices.unshift(doc);
    if (parsed.data.kind === "invoice") {
      const j = d.jobs.find((x) => x.id === job.id);
      if (j && j.status === "completed") j.status = "invoiced";
    }
  });

  return NextResponse.json({ invoice: doc }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const id = z.string().parse(body.id);
  await updateStore((d) => {
    const inv = d.invoices.find((i) => i.id === id);
    if (!inv) return;
    if (body.status) inv.status = body.status;
  });
  return NextResponse.json({ ok: true });
}
