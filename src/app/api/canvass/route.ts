import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import { onLeadCreated } from "@/lib/workflows";
import type { CanvassStop, Lead } from "@/lib/types";

const createSchema = z.object({
  address: z.string().min(1),
  city: z.string().min(1),
  outcome: z.enum([
    "not_home",
    "interested",
    "appointment",
    "not_interested",
    "do_not_knock",
  ]),
  notes: z.string().optional(),
  salesRepId: z.string().min(1),
  createLead: z.boolean().optional(),
  leadName: z.string().optional(),
  leadPhone: z.string().optional(),
});

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    stops: data.canvassStops,
    employees: data.employees.filter((e) => e.role === "sales" || e.role === "admin"),
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

  const stamp = nowIso();
  const shouldCreateLead =
    !!parsed.data.createLead &&
    (parsed.data.outcome === "interested" ||
      parsed.data.outcome === "appointment");

  const lead: Lead | null = shouldCreateLead
    ? {
        id: newId(),
        name: parsed.data.leadName || `Canvass lead @ ${parsed.data.address}`,
        phone: parsed.data.leadPhone || "",
        email: "",
        address: parsed.data.address,
        city: parsed.data.city,
        source: "Door-to-door",
        status: parsed.data.outcome === "appointment" ? "qualified" : "new",
        jobType: "residential",
        notes: parsed.data.notes ?? "",
        assignedToId: parsed.data.salesRepId,
        companyId: null,
        leadScore: 50,
        createdAt: stamp,
        updatedAt: stamp,
      }
    : null;

  const stop: CanvassStop = {
    id: newId(),
    address: parsed.data.address,
    city: parsed.data.city,
    outcome: parsed.data.outcome,
    notes: parsed.data.notes ?? "",
    salesRepId: parsed.data.salesRepId,
    leadId: lead?.id ?? null,
    createdAt: stamp,
  };

  await updateStore((data) => {
    if (lead) {
      data.leads.unshift(lead);
      onLeadCreated(data, lead, parsed.data.salesRepId);
    }
    data.canvassStops.unshift(stop);
  });

  return NextResponse.json({ stop, lead }, { status: 201 });
}
