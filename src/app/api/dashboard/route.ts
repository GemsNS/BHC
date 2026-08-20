import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export async function GET() {
  const data = await readStore();
  const openLeads = data.leads.filter((l) => !["won", "lost"].includes(l.status));
  const activeJobs = data.jobs.filter((j) =>
    ["scheduled", "in_progress", "on_hold"].includes(j.status),
  );
  const clockedIn = data.timeEntries.filter((t) => t.clockOut === null);
  const pipelineValue = openLeads.reduce((sum, l) => {
    const related = data.jobs.find((j) => j.leadId === l.id);
    return sum + (related?.estimatedValue ?? 15000);
  }, 0);

  return NextResponse.json({
    stats: {
      openLeads: openLeads.length,
      activeJobs: activeJobs.length,
      clockedIn: clockedIn.length,
      fleetActive: data.vehicles.filter((v) => v.status === "active").length,
      pipelineValue,
      teamSize: data.employees.filter((e) => e.active).length,
    },
    recentLeads: [...data.leads]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5),
    activeJobs: activeJobs.slice(0, 5),
    vehicles: data.vehicles,
  });
}
