import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import type { Lead } from "@/lib/types";

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string(),
  address: z.string().min(1),
  city: z.string().min(1),
  source: z.string().min(1),
  jobType: z.enum(["residential", "commercial"]),
  notes: z.string().optional(),
  assignedToId: z.string().nullable().optional(),
  status: z
    .enum(["new", "contacted", "qualified", "estimate", "won", "lost"])
    .optional(),
});

export async function GET() {
  const data = await readStore();
  const leads = [...data.leads].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  return NextResponse.json({ leads, employees: data.employees });
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

  const stamp = nowIso();
  const lead: Lead = {
    id: newId(),
    name: parsed.data.name,
    phone: parsed.data.phone,
    email: parsed.data.email,
    address: parsed.data.address,
    city: parsed.data.city,
    source: parsed.data.source,
    status: parsed.data.status ?? "new",
    jobType: parsed.data.jobType,
    notes: parsed.data.notes ?? "",
    assignedToId: parsed.data.assignedToId ?? null,
    createdAt: stamp,
    updatedAt: stamp,
  };

  await updateStore((data) => {
    data.leads.unshift(lead);
  });

  return NextResponse.json({ lead }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const id = z.string().parse(body.id);
  const status = z
    .enum(["new", "contacted", "qualified", "estimate", "won", "lost"])
    .parse(body.status);

  let updated: Lead | null = null;
  await updateStore((data) => {
    const lead = data.leads.find((l) => l.id === id);
    if (!lead) return;
    lead.status = status;
    lead.updatedAt = nowIso();
    updated = lead;
  });

  if (!updated) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  return NextResponse.json({ lead: updated });
}
