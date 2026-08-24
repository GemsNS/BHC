import type { AppData, Employee, KnockEvent } from "./types";
import { buildSeedData } from "./seed";
import { normalizeAddressKey } from "./knocker/geo";
import { DEFAULT_KNOCK_COLORS } from "./knocker/colors";

function normalizeKnock(k: KnockEvent): KnockEvent {
  return {
    ...k,
    addressKey: k.addressKey ?? normalizeAddressKey(k.address),
    tagIds: k.tagIds ?? [],
    visitedByIds: k.visitedByIds ?? [k.knockerId],
    activityLog: k.activityLog ?? [],
    updatedAt: k.updatedAt ?? k.createdAt,
    territoryId: k.territoryId ?? null,
    homeownerName: k.homeownerName ?? "",
    phone: k.phone ?? "",
    email: k.email ?? "",
  };
}

function withLoginFields(emp: Employee & { login?: string; pin?: string }): Employee {
  const login =
    emp.login ||
    emp.email.split("@")[0] ||
    emp.name.toLowerCase().replace(/\s+/g, ".");
  const pin = emp.pin || "1234";
  return { ...emp, login, pin };
}

/**
 * Older demos used login `jordan` while the UI/seed chips show `cameron`.
 * Map that identity forward so demo admin login keeps working.
 */
function migrateEmployee(emp: Employee): Employee {
  let next = emp;
  if (
    emp.id === "emp-admin" ||
    emp.login?.toLowerCase() === "jordan" ||
    emp.email?.toLowerCase().startsWith("jordan@")
  ) {
    next = {
      ...emp,
      name: emp.name?.toLowerCase().includes("jordan")
        ? "Cameron Brown"
        : emp.name,
      login: "cameron",
      email: emp.email?.toLowerCase().includes("jordan@")
        ? "cameron@bhcontracting.co"
        : emp.email?.replace(/@bighoss\.com$/i, "@bhcontracting.co") ||
          emp.email,
      pin: emp.pin || "1001",
    };
  } else if (emp.email && /@bighoss\.com$/i.test(emp.email)) {
    next = {
      ...emp,
      email: emp.email.replace(/@bighoss\.com$/i, "@bhcontracting.co"),
    };
  }
  return withLoginFields(next);
}

/** Fill missing collections / fields when loading older stores */
export function normalizeStore(raw: Partial<AppData>): AppData {
  const seed = buildSeedData();
  const employees = (raw.employees ?? seed.employees).map((e) =>
    migrateEmployee(e as Employee),
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
    zones: (raw.zones ?? seed.zones).map((z) => ({
      ...z,
      polygon: z.polygon ?? null,
      colorHex: z.colorHex ?? "#ff2a2a",
    })),
    knocks: (raw.knocks ?? seed.knocks).map((k) => normalizeKnock(k as KnockEvent)),
    knockTerritories: raw.knockTerritories ?? seed.knockTerritories,
    knockTags: raw.knockTags ?? seed.knockTags,
    knockProducts: raw.knockProducts ?? seed.knockProducts,
    knockServices: raw.knockServices ?? seed.knockServices,
    knockTodos: raw.knockTodos ?? seed.knockTodos,
    knockProposals: raw.knockProposals ?? seed.knockProposals,
    knockChat: raw.knockChat ?? seed.knockChat,
    knockRepLocations: raw.knockRepLocations ?? seed.knockRepLocations,
    knockColorCodes: raw.knockColorCodes ?? seed.knockColorCodes ?? DEFAULT_KNOCK_COLORS,
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
    assistantProfiles: raw.assistantProfiles ?? seed.assistantProfiles,
    assistantAutomations: raw.assistantAutomations ?? seed.assistantAutomations,
    assistantAudit: raw.assistantAudit ?? seed.assistantAudit,
  };
}
