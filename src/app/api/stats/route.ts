import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export async function GET() {
  const data = await readStore();
  const materialSpend = data.materials.reduce(
    (s, m) => s + m.quantity * m.unitCost,
    0,
  );
  const fuelSpend = data.fuelLogs.reduce((s, f) => s + f.cost, 0);
  const fuelGallons = data.fuelLogs.reduce((s, f) => s + f.gallons, 0);
  const contractValue = data.jobs.reduce((s, j) => s + (j.contractValue || 0), 0);
  const pipelineLeads = data.leads.filter(
    (l) => !["won", "lost"].includes(l.status),
  ).length;
  const knocksToday = data.knocks.filter((k) => {
    const d = new Date(k.createdAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;
  const knocksByOutcome = data.knocks.reduce<Record<string, number>>((acc, k) => {
    acc[k.outcome] = (acc[k.outcome] || 0) + 1;
    return acc;
  }, {});
  const zoneProgress = data.zones.map((z) => {
    const count = data.knocks.filter((k) => k.zoneId === z.id).length;
    return {
      zoneId: z.id,
      name: z.name,
      status: z.status,
      knocks: count,
      target: z.targetDoors,
      pct: z.targetDoors ? Math.min(100, Math.round((count / z.targetDoors) * 100)) : 0,
      assignees: z.assignedKnockerIds.length,
    };
  });
  const monthProj = data.projections[0] || null;

  return NextResponse.json({
    stats: {
      openLeads: pipelineLeads,
      activeJobs: data.jobs.filter((j) =>
        ["scheduled", "in_progress", "on_hold"].includes(j.status),
      ).length,
      contractValue,
      materialSpend,
      fuelSpend,
      fuelGallons,
      knocksTotal: data.knocks.length,
      knocksToday,
      zonesActive: data.zones.filter((z) => z.status === "active").length,
      teamSize: data.employees.filter((e) => e.active).length,
      clockedIn: data.timeEntries.filter((t) => t.clockOut === null).length,
    },
    knocksByOutcome,
    zoneProgress,
    projection: monthProj,
    recentKnocks: data.knocks.slice(0, 10),
    materials: data.materials.slice(0, 8),
    fuelLogs: data.fuelLogs.slice(0, 8),
  });
}
