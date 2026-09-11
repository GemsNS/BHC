import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export async function GET() {
  try {
    const data = await readStore();
    const materials = data.materials ?? [];
    const fuelLogs = data.fuelLogs ?? [];
    const jobs = data.jobs ?? [];
    const leads = data.leads ?? [];
    const knocks = data.knocks ?? [];
    const zones = data.zones ?? [];
    const employees = data.employees ?? [];
    const timeEntries = data.timeEntries ?? [];
    const projections = data.projections ?? [];

    const materialSpend = materials.reduce(
      (s, m) => s + (m.quantity || 0) * (m.unitCost || 0),
      0,
    );
    const fuelSpend = fuelLogs.reduce((s, f) => s + (f.cost || 0), 0);
    const fuelGallons = fuelLogs.reduce((s, f) => s + (f.gallons || 0), 0);
    const contractValue = jobs.reduce((s, j) => s + (j.contractValue || 0), 0);
    const openLeads = leads.filter(
      (l) => !["won", "lost"].includes(l.status),
    ).length;
    const knocksToday = knocks.filter((k) => {
      const d = new Date(k.createdAt);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    const knocksByOutcome = knocks.reduce<Record<string, number>>((acc, k) => {
      acc[k.outcome] = (acc[k.outcome] || 0) + 1;
      return acc;
    }, {});
    const zoneProgress = zones.map((z) => {
      const assignees = Array.isArray(z.assignedKnockerIds)
        ? z.assignedKnockerIds.length
        : 0;
      const target =
        typeof z.targetDoors === "number" && Number.isFinite(z.targetDoors)
          ? z.targetDoors
          : 0;
      const count = knocks.filter((k) => k.zoneId === z.id).length;
      return {
        zoneId: z.id,
        name: z.name,
        status: z.status,
        knocks: count,
        target,
        pct: target ? Math.min(100, Math.round((count / target) * 100)) : 0,
        assignees,
      };
    });

    return NextResponse.json({
      stats: {
        openLeads,
        activeJobs: jobs.filter((j) =>
          ["scheduled", "in_progress", "on_hold"].includes(j.status),
        ).length,
        contractValue,
        materialSpend,
        fuelSpend,
        fuelGallons,
        knocksTotal: knocks.length,
        knocksToday,
        zonesActive: zones.filter((z) => z.status === "active").length,
        teamSize: employees.filter((e) => e.active).length,
        clockedIn: timeEntries.filter((t) => t.clockOut === null).length,
      },
      knocksByOutcome,
      zoneProgress,
      projection: projections[0] || null,
      recentKnocks: knocks.slice(0, 10),
      materials: materials.slice(0, 8),
      fuelLogs: fuelLogs.slice(0, 8),
    });
  } catch (err) {
    console.error("[api/stats]", err);
    return NextResponse.json(
      { error: "Failed to compute statistics" },
      { status: 500 },
    );
  }
}
