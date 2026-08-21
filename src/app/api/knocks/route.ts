import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import type { KnockEvent, Lead } from "@/lib/types";

const knockSchema = z.object({
  zoneId: z.string().min(1),
  knockerId: z.string().min(1),
  address: z.string().min(1),
  outcome: z.enum([
    "not_home",
    "interested",
    "appointment",
    "not_interested",
    "do_not_knock",
  ]),
  notes: z.string().optional(),
  createLead: z.boolean().optional(),
  leadName: z.string().optional(),
  leadPhone: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
});

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    knocks: data.knocks,
    zones: data.zones,
    employees: data.employees,
    leads: data.leads,
  });
}

export async function POST(request: Request) {
  const parsed = knockSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const stamp = nowIso();
  const shouldLead =
    !!parsed.data.createLead &&
    (parsed.data.outcome === "interested" ||
      parsed.data.outcome === "appointment");

  const zone = (await readStore()).zones.find((z) => z.id === parsed.data.zoneId);
  const lead: Lead | null = shouldLead
    ? {
        id: newId(),
        name: parsed.data.leadName || `Knock lead @ ${parsed.data.address}`,
        phone: parsed.data.leadPhone || "",
        email: "",
        address: parsed.data.address,
        city: zone?.city || "",
        source: "Door-to-door",
        status: parsed.data.outcome === "appointment" ? "qualified" : "new",
        jobType: "residential",
        notes: parsed.data.notes ?? "",
        assignedToId: parsed.data.knockerId,
        createdAt: stamp,
        updatedAt: stamp,
      }
    : null;

  const knock: KnockEvent = {
    id: newId(),
    zoneId: parsed.data.zoneId,
    knockerId: parsed.data.knockerId,
    address: parsed.data.address,
    outcome: parsed.data.outcome,
    notes: parsed.data.notes ?? "",
    leadId: lead?.id ?? null,
    lat: parsed.data.lat ?? null,
    lng: parsed.data.lng ?? null,
    createdAt: stamp,
  };

  await updateStore((data) => {
    if (lead) data.leads.unshift(lead);
    data.knocks.unshift(knock);
    data.canvassStops.unshift({
      id: newId(),
      address: knock.address,
      city: zone?.city || "",
      outcome: knock.outcome,
      notes: knock.notes,
      salesRepId: knock.knockerId,
      leadId: knock.leadId,
      createdAt: stamp,
      zoneId: knock.zoneId,
    });
  });

  return NextResponse.json({ knock, lead }, { status: 201 });
}
