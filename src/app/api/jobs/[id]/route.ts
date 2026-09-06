import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiEmployee } from "@/lib/api-auth";
import { live } from "@/lib/events";
import { jobHub } from "@/lib/job-hub";
import { nextNumber, publicToken } from "@/lib/numbering";
import { newId, nowIso, readStore, updateStoreAsync } from "@/lib/store";
import { dispatchWebhooks } from "@/lib/webhooks";
import { onJobStatusChanged } from "@/lib/workflows";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const { id } = await params;
  const data = await readStore();
  const hub = jobHub(data, id);
  if (!hub) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({
    ...hub,
    employees: data.employees.map((e) => ({ id: e.id, name: e.name, role: e.role })),
    portalUrl: hub.job.portalToken ? `${(process.env.APP_BASE_URL ?? "https://bhcontracting.ca").replace(/\/$/, "")}/portal/${hub.job.portalToken}` : null,
  });
}

const patchSchema = z.object({
  title: z.string().optional(),
  customerName: z.string().optional(),
  address: z.string().optional(),
  status: z.enum(["scheduled", "in_progress", "on_hold", "completed", "invoiced"]).optional(),
  crewLeadId: z.string().nullable().optional(),
  startDate: z.string().optional(),
  estimatedValue: z.number().optional(),
  contractValue: z.number().optional(),
  notes: z.string().optional(),
  leadId: z.string().nullable().optional(),
  ensurePortal: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: RouteParams) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const patch = parsed.data;
  let found = false;
  await updateStoreAsync(async (d) => {
    const job = d.jobs.find((j) => j.id === id);
    if (!job) return;
    found = true;
    const previous = job.status;
    if (patch.title != null) job.title = patch.title;
    if (patch.customerName != null) job.customerName = patch.customerName;
    if (patch.address != null) job.address = patch.address;
    if (patch.crewLeadId !== undefined) job.crewLeadId = patch.crewLeadId;
    if (patch.startDate != null) job.startDate = patch.startDate;
    if (patch.estimatedValue != null) job.estimatedValue = patch.estimatedValue;
    if (patch.contractValue != null) job.contractValue = patch.contractValue;
    if (patch.notes != null) job.notes = patch.notes;
    if (patch.leadId !== undefined) job.leadId = patch.leadId;
    if (!job.number) job.number = nextNumber(d, "job");
    if ((patch.ensurePortal || patch.status) && !job.portalToken) job.portalToken = publicToken(newId);
    if (patch.status && patch.status !== previous) {
      job.status = patch.status;
      if (patch.status === "completed") job.completedAt = nowIso();
      onJobStatusChanged(d, job, employee.id);
      live.job(`${job.title}: ${previous} → ${patch.status}`, undefined, { jobId: job.id });
      await dispatchWebhooks(d, "job.status_changed", { jobId: job.id, title: job.title, from: previous, to: patch.status }, newId, nowIso);
    }
  });
  if (!found) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const data = await readStore();
  return NextResponse.json({ job: data.jobs.find((j) => j.id === id) });
}
