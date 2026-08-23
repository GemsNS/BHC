import type { AppData, Employee } from "./types";
import { buildSeedData } from "./seed";

function withLoginFields(emp: Employee & { login?: string; pin?: string }): Employee {
  const login =
    emp.login ||
    emp.email.split("@")[0] ||
    emp.name.toLowerCase().replace(/\s+/g, ".");
  const pin = emp.pin || "1234";
  return { ...emp, login, pin };
}

/** Fill missing collections / fields when loading older stores */
export function normalizeStore(raw: Partial<AppData>): AppData {
  const seed = buildSeedData();
  const employees = (raw.employees ?? seed.employees).map((e) =>
    withLoginFields(e as Employee),
  );
  return {
    employees,
    leads: (raw.leads ?? seed.leads).map((l) => ({
      ...l,
      companyId: l.companyId ?? null,
      leadScore: l.leadScore ?? 50,
    })),
    jobs: (raw.jobs ?? seed.jobs).map((j) => ({
      ...j,
      contractValue: j.contractValue ?? j.estimatedValue ?? 0,
    })),
    vehicles: (raw.vehicles ?? seed.vehicles).map((v) => ({
      ...v,
      odometer: v.odometer ?? 0,
    })),
    timeEntries: raw.timeEntries ?? seed.timeEntries,
    canvassStops: raw.canvassStops ?? seed.canvassStops,
    zones: raw.zones ?? seed.zones,
    knocks: raw.knocks ?? seed.knocks,
    materials: raw.materials ?? seed.materials,
    fuelLogs: raw.fuelLogs ?? seed.fuelLogs,
    projections: raw.projections ?? seed.projections,
    announcements: raw.announcements ?? seed.announcements,
    tools: raw.tools ?? seed.tools,
    toolCheckouts: raw.toolCheckouts ?? seed.toolCheckouts,
    inventory: raw.inventory ?? seed.inventory,
    inventoryTxns: raw.inventoryTxns ?? seed.inventoryTxns,
    damageReports: raw.damageReports ?? seed.damageReports,
    jobProgress: raw.jobProgress ?? seed.jobProgress,
    invoices: raw.invoices ?? seed.invoices,
    companies: raw.companies ?? seed.companies,
    deals: raw.deals ?? seed.deals,
    activities: raw.activities ?? seed.activities,
    tickets: raw.tickets ?? seed.tickets,
    shifts: raw.shifts ?? seed.shifts,
    workflows: raw.workflows ?? seed.workflows,
    workflowRuns: raw.workflowRuns ?? seed.workflowRuns,
    sequences: raw.sequences ?? seed.sequences,
    sequenceEnrollments: raw.sequenceEnrollments ?? seed.sequenceEnrollments,
    outreachQueue: raw.outreachQueue ?? seed.outreachQueue,
  };
}
