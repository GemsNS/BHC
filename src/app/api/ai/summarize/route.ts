import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiEmployee } from "@/lib/api-auth";
import { readStore } from "@/lib/store";
import { summarizeProgress } from "@/lib/ai-summarize";
import {
  checkRateLimit,
  clientIp,
  envInt,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { checkAiBudget, estimateTokensFromText, recordAiUsage } from "@/lib/ai-budget";
import { getAIStatus } from "@/lib/ai-provider";

export async function POST(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;

  const ip = clientIp(request);
  const rl = checkRateLimit({
    key: `ai-summarize:${employee.id}:${ip}`,
    limit: envInt("RATE_LIMIT_AI_PER_MIN", 20),
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many summarize requests." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const budget = await checkAiBudget({ employeeId: employee.id });
  if (!budget.ok) {
    return NextResponse.json(
      { error: budget.reason },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

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
      const entries = data.jobProgress.filter((p) => p.jobId === parsed.data.jobId);
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

  const status = getAIStatus();
  await recordAiUsage({
    provider: status.provider,
    employeeId: employee.id,
    estimatedTokens: estimateTokensFromText(notes.join("\n") + (result.summary || "")),
  });

  return NextResponse.json(result, { headers: rateLimitHeaders(rl) });
}
