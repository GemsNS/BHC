import { NextResponse } from "next/server";
import { z } from "zod";
import { CRA_RATE_PER_KM, travelCost } from "@/lib/fuel-travel";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import type { FuelLog } from "@/lib/types";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    fuelLogs: data.fuelLogs,
    vehicles: data.vehicles,
    employees: data.employees,
  });
}

export async function POST(request: Request) {
  const schema = z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("fill"),
      vehicleId: z.string(),
      employeeId: z.string(),
      gallons: z.number().positive(),
      cost: z.number().nonnegative(),
      odometer: z.number().nonnegative(),
      station: z.string().optional(),
      notes: z.string().optional(),
    }),
    z.object({
      kind: z.literal("travel"),
      vehicleId: z.string(),
      employeeId: z.string(),
      odometer: z.number().nonnegative(),
      fromAddress: z.string().min(1),
      toAddress: z.string().min(1),
      distanceKm: z.number().positive(),
      ratePerKm: z.number().positive().optional(),
      notes: z.string().optional(),
      cost: z.number().nonnegative().optional(),
    }),
  ]);
  const body = await request.json();
  // Back-compat: payloads without kind are pump fills
  const withKind =
    body && typeof body === "object" && !("kind" in body)
      ? { ...body, kind: "fill" }
      : body;
  const parsed = schema.safeParse(withKind);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let log: FuelLog;
  if (parsed.data.kind === "fill") {
    log = {
      id: newId(),
      kind: "fill",
      vehicleId: parsed.data.vehicleId,
      employeeId: parsed.data.employeeId,
      gallons: parsed.data.gallons,
      cost: parsed.data.cost,
      odometer: parsed.data.odometer,
      station: parsed.data.station ?? "",
      filledAt: nowIso(),
      notes: parsed.data.notes ?? "",
    };
  } else {
    const rate = parsed.data.ratePerKm ?? CRA_RATE_PER_KM;
    const cost = parsed.data.cost ?? travelCost(parsed.data.distanceKm, rate);
    log = {
      id: newId(),
      kind: "travel",
      vehicleId: parsed.data.vehicleId,
      employeeId: parsed.data.employeeId,
      gallons: 0,
      cost,
      odometer: parsed.data.odometer,
      station: "Travel / mileage",
      filledAt: nowIso(),
      notes: parsed.data.notes ?? "",
      fromAddress: parsed.data.fromAddress,
      toAddress: parsed.data.toAddress,
      distanceKm: parsed.data.distanceKm,
      ratePerKm: rate,
    };
  }

  await updateStore((d) => {
    d.fuelLogs.unshift(log);
    const veh = d.vehicles.find((v) => v.id === log.vehicleId);
    if (veh) {
      veh.odometer = Math.max(veh.odometer, log.odometer);
      veh.lastUpdate = log.filledAt;
    }
  });
  return NextResponse.json({ fuelLog: log }, { status: 201 });
}
