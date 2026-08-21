import { NextResponse } from "next/server";
import { z } from "zod";
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
  const schema = z.object({
    vehicleId: z.string(),
    employeeId: z.string(),
    gallons: z.number().positive(),
    cost: z.number().nonnegative(),
    odometer: z.number().nonnegative(),
    station: z.string().optional(),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const log: FuelLog = {
    id: newId(),
    vehicleId: parsed.data.vehicleId,
    employeeId: parsed.data.employeeId,
    gallons: parsed.data.gallons,
    cost: parsed.data.cost,
    odometer: parsed.data.odometer,
    station: parsed.data.station ?? "",
    filledAt: nowIso(),
    notes: parsed.data.notes ?? "",
  };
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
