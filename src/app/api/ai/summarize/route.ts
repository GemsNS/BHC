import { NextResponse } from "next/server";
import { z } from "zod";
import { readStore } from "@/lib/store";
import { summarizeProgress } from "@/lib/ai-summarize";

export async function POST(request: Request) {
  const schema = z.object({
    jobId: z.string().optional(),
    notes: z.array(z.string()).optional(),
    imageCount: z.number().optional(),
    jobTitle: z.string().optional(),
    customerName: z.string().optional(),
  });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  let notes = parsed.data.notes || [];
  let imageCount = parsed.data.imageCount || 0;
  let jobTitle = parsed.data.jobTitle || "Job";
  let customerName = parsed.data.customerName || "";

  if (parsed.data.jobId) {
    const data = await readStore();
    const job = data.jobs.find((j) => j.id === parsed.data.jobId);
    if (job) {
      jobTitle = job.title;
      customerName = job.customerName;
    }
    if (!notes.length) {
      const entries = data.jobProgress.filter(
        (p) => p.jobId === parsed.data.jobId,
      );
      notes = entries.map((e) => e.notes);
      imageCount = entries.reduce((s, e) => s + e.imageDataUrls.length, 0);
    }
  }

  const result = await summarizeProgress({
    jobTitle,
    customerName,
    notes,
    imageCount,
  });
  return NextResponse.json(result);
}
