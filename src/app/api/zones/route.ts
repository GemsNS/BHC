import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import type { KnockZone } from "@/lib/types";

const zoneSchema = z.object({
  name: z.string().min(1),
  neighborhood: z.string().min(1),
  city: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["open", "active", "completed", "paused"]).optional(),
  assignedKnockerIds: z.array(z.string()).optional(),
  targetDoors: z.number().int().nonnegative().optional(),
  centerLat: z.number().optional(),
  centerLng: z.number().optional(),
});

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    zones: data.zones,
    knocks: data.knocks,
    employees: data.employees,
  });
}

export async function POST(request: Request) {
  const parsed = zoneSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const zone: KnockZone = {
    id: newId(),
    name: parsed.data.name,
    neighborhood: parsed.data.neighborhood,
    city: parsed.data.city,
    description: parsed.data.description ?? "",
    status: parsed.data.status ?? "open",
    assignedKnockerIds: parsed.data.assignedKnockerIds ?? [],
    targetDoors: parsed.data.targetDoors ?? 50,
    centerLat: parsed.data.centerLat ?? 36.974,
    centerLng: parsed.data.centerLng ?? -122.03,
    createdAt: nowIso(),
  };
  await updateStore((data) => {
    data.zones.unshift(zone);
  });
  return NextResponse.json({ zone }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const id = z.string().parse(body.id);
  let updated: KnockZone | null = null;
  await updateStore((data) => {
    const zone = data.zones.find((z) => z.id === id);
    if (!zone) return;
    if (body.name != null) zone.name = String(body.name);
    if (body.neighborhood != null) zone.neighborhood = String(body.neighborhood);
    if (body.city != null) zone.city = String(body.city);
    if (body.description != null) zone.description = String(body.description);
    if (body.status != null) zone.status = body.status;
    if (body.assignedKnockerIds != null)
      zone.assignedKnockerIds = body.assignedKnockerIds;
    if (body.targetDoors != null) zone.targetDoors = Number(body.targetDoors);
    updated = zone;
  });
  if (!updated) {
    return NextResponse.json({ error: "Zone not found" }, { status: 404 });
  }
  return NextResponse.json({ zone: updated });
}
