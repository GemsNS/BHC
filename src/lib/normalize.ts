import type { AppData } from "./types";
import { buildSeedData } from "./seed";

/** Fill missing collections / fields when loading older stores */
export function normalizeStore(raw: Partial<AppData>): AppData {
  const seed = buildSeedData();
  return {
    employees: raw.employees ?? seed.employees,
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
  };
}
