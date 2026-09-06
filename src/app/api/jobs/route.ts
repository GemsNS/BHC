import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, nowIso, readStore, updateStoreAsync } from "@/lib/store";
import type { Job } from "@/lib/types";
import { dispatchWebhooks } from "@/lib/webhooks";
import { onJobCreated, onJobStatusChanged } from "@/lib/workflows";

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
  contractValue: z.number().nonnegative().optional(),
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
    contractValue: parsed.data.contractValue ?? parsed.data.estimatedValue,
    notes: parsed.data.notes ?? "",
    createdAt: nowIso(),
  };

  await updateStoreAsync(async (data) => {
    data.jobs.unshift(job);
    onJobCreated(data, job, parsed.data.crewLeadId ?? undefined);
    await dispatchWebhooks(
      data,
      "job.created",
      { jobId: job.id, title: job.title, status: job.status, leadId: job.leadId },
      newId,
      nowIso,
    );
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
  await updateStoreAsync(async (data) => {
    const job = data.jobs.find((j) => j.id === id);
    if (!job) return;
    const previous = job.status;
    job.status = status;
    updated = job;
    if (previous !== status) {
      onJobStatusChanged(data, job);
      await dispatchWebhooks(
        data,
        "job.status_changed",
        { jobId: job.id, title: job.title, from: previous, to: status },
        newId,
        nowIso,
      );
    }
  });

  if (!updated) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ job: updated });
}
