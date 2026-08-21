import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import type { JobProgressEntry } from "@/lib/types";
import { summarizeProgress } from "@/lib/ai-summarize";

export async function GET(request: Request) {
  const data = await readStore();
  const jobId = new URL(request.url).searchParams.get("jobId");
  const entries = jobId
    ? data.jobProgress.filter((p) => p.jobId === jobId)
    : data.jobProgress;
  return NextResponse.json({
    entries,
    jobs: data.jobs,
    employees: data.employees,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const action = String(body.action || "create");

  if (action === "create") {
    const schema = z.object({
      jobId: z.string(),
      authorId: z.string(),
      notes: z.string().min(1),
      imageDataUrls: z.array(z.string()).optional(),
      runAi: z.boolean().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const images = (parsed.data.imageDataUrls || []).slice(0, 6);
    let aiSummary: string | null = null;
    if (parsed.data.runAi) {
      const data = await readStore();
      const job = data.jobs.find((j) => j.id === parsed.data.jobId);
      const result = await summarizeProgress({
        jobTitle: job?.title || "Job",
        customerName: job?.customerName || "",
        notes: [parsed.data.notes],
        imageCount: images.length,
      });
      aiSummary = result.summary;
    }
    const entry: JobProgressEntry = {
      id: newId(),
      jobId: parsed.data.jobId,
      authorId: parsed.data.authorId,
      notes: parsed.data.notes,
      imageDataUrls: images,
      aiSummary,
      createdAt: nowIso(),
    };
    await updateStore((d) => {
      d.jobProgress.unshift(entry);
    });
    return NextResponse.json({ entry }, { status: 201 });
  }

  if (action === "summarize") {
    const schema = z.object({
      jobId: z.string(),
      entryIds: z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid" }, { status: 400 });
    }
    const data = await readStore();
    const job = data.jobs.find((j) => j.id === parsed.data.jobId);
    const entries = data.jobProgress.filter(
      (e) =>
        e.jobId === parsed.data.jobId &&
        (!parsed.data.entryIds?.length || parsed.data.entryIds.includes(e.id)),
    );
    const result = await summarizeProgress({
      jobTitle: job?.title || "Job",
      customerName: job?.customerName || "",
      notes: entries.map((e) => e.notes),
      imageCount: entries.reduce((s, e) => s + e.imageDataUrls.length, 0),
    });
    await updateStore((d) => {
      for (const e of d.jobProgress) {
        if (
          e.jobId === parsed.data.jobId &&
          (!parsed.data.entryIds?.length || parsed.data.entryIds.includes(e.id))
        ) {
          e.aiSummary = result.summary;
        }
      }
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
