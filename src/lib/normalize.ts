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
    leads: raw.leads ?? seed.leads,
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
  };
}
