import { NextResponse } from "next/server";
import { writeStore } from "@/lib/store";
import { buildSeedData } from "@/lib/seed";

export async function POST() {
  const seed = buildSeedData();
  await writeStore(seed);
  return NextResponse.json({
    ok: true,
    counts: {
      employees: seed.employees.length,
      leads: seed.leads.length,
      jobs: seed.jobs.length,
      vehicles: seed.vehicles.length,
      timeEntries: seed.timeEntries.length,
      canvassStops: seed.canvassStops.length,
      zones: seed.zones.length,
      knocks: seed.knocks.length,
      materials: seed.materials.length,
      fuelLogs: seed.fuelLogs.length,
      projections: seed.projections.length,
    },
  });
}
