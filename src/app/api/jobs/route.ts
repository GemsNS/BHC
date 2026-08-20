import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import type { Job } from "@/lib/types";

const createSchema = z.object({
  title: z.string().min(1),
  customerName: z.string().min(1),
  address: z.string().min(1),
  jobType: z.enum(["residential", "commercial"]),
  status: z
    .enum(["scheduled", "in_progress", "on_hold", "completed", "invoiced"])
    .optional(),
  leadId: z.string().nullable().optional(),
  crewLeadId: z.string().nullable().optional(),
  startDate: z.string().min(1),
  estimatedValue: z.number().nonnegative(),
  notes: z.string().optional(),
});

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    jobs: data.jobs,
    employees: data.employees,
    leads: data.leads,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const job: Job = {
    id: newId(),
    title: parsed.data.title,
    customerName: parsed.data.customerName,
    address: parsed.data.address,
    jobType: parsed.data.jobType,
    status: parsed.data.status ?? "scheduled",
    leadId: parsed.data.leadId ?? null,
    crewLeadId: parsed.data.crewLeadId ?? null,
    startDate: parsed.data.startDate,
    estimatedValue: parsed.data.estimatedValue,
    notes: parsed.data.notes ?? "",
    createdAt: nowIso(),
  };

  await updateStore((data) => {
    data.jobs.unshift(job);
  });

  return NextResponse.json({ job }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const id = z.string().parse(body.id);
  const status = z
    .enum(["scheduled", "in_progress", "on_hold", "completed", "invoiced"])
    .parse(body.status);

  let updated: Job | null = null;
  await updateStore((data) => {
    const job = data.jobs.find((j) => j.id === id);
    if (!job) return;
    job.status = status;
    updated = job;
  });

  if (!updated) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ job: updated });
}
