import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import type { DamageReport } from "@/lib/types";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    reports: data.damageReports,
    tools: data.tools,
    vehicles: data.vehicles,
    jobs: data.jobs,
    employees: data.employees,
  });
}

export async function POST(request: Request) {
  const schema = z.object({
    targetType: z.enum(["tool", "vehicle", "material", "job_site", "other"]),
    targetId: z.string().nullable().optional(),
    targetLabel: z.string().min(1),
    jobId: z.string().nullable().optional(),
    reportedById: z.string(),
    severity: z.enum(["low", "medium", "high", "critical"]),
    description: z.string().min(1),
    imageDataUrls: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const report: DamageReport = {
    id: newId(),
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId ?? null,
    targetLabel: parsed.data.targetLabel,
    jobId: parsed.data.jobId ?? null,
    reportedById: parsed.data.reportedById,
    severity: parsed.data.severity,
    description: parsed.data.description,
    imageDataUrls: (parsed.data.imageDataUrls || []).slice(0, 6),
    createdAt: nowIso(),
    resolved: false,
  };
  await updateStore((d) => {
    d.damageReports.unshift(report);
    if (report.targetType === "tool" && report.targetId) {
      const tool = d.tools.find((t) => t.id === report.targetId);
      if (tool && report.severity === "critical") tool.status = "damaged";
    }
  });
  return NextResponse.json({ report }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const id = z.string().parse(body.id);
  await updateStore((d) => {
    const r = d.damageReports.find((x) => x.id === id);
    if (!r) return;
    if (body.resolved != null) r.resolved = Boolean(body.resolved);
  });
  return NextResponse.json({ ok: true });
}
