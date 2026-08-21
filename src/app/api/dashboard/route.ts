import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export async function GET() {
  const data = await readStore();
  const openLeads = data.leads.filter((l) => !["won", "lost"].includes(l.status));
  const activeJobs = data.jobs.filter((j) =>
    ["scheduled", "in_progress", "on_hold"].includes(j.status),
  );
  const clockedIn = data.timeEntries.filter((t) => t.clockOut === null);
  const materialSpend = data.materials.reduce(
    (s, m) => s + m.quantity * m.unitCost,
    0,
  );
  const knocksToday = data.knocks.filter((k) => {
    const d = new Date(k.createdAt);
    return d.toDateString() === new Date().toDateString();
  }).length;

  return NextResponse.json({
    stats: {
      openLeads: openLeads.length,
      activeJobs: activeJobs.length,
      clockedIn: clockedIn.length,
      fleetActive: data.vehicles.filter((v) => v.status === "active").length,
      pipelineValue: openLeads.length * 18000,
      teamSize: data.employees.filter((e) => e.active).length,
      knocksToday,
      zonesActive: data.zones.filter((z) => z.status === "active").length,
      materialSpend,
      fuelSpend: data.fuelLogs.reduce((s, f) => s + f.cost, 0),
    },
    recentLeads: [...data.leads]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5),
    activeJobs: activeJobs.slice(0, 5),
    vehicles: data.vehicles,
    recentKnocks: data.knocks.slice(0, 5),
    zoneProgress: data.zones.slice(0, 4).map((z) => ({
      ...z,
      knockCount: data.knocks.filter((k) => k.zoneId === z.id).length,
    })),
  });
}
