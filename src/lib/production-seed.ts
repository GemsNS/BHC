/**
 * Production seed — clean HRM starter, one staff account per role.
 * Default login PIN: 0000 (must set password on first sign-in).
 */

import { DEFAULT_STAFF_PIN } from "./auth-credentials";
import { UNIACKE_SITE_TRAVEL, travelCost } from "./fuel-travel";
import type {
  AppData,
  AssistantCriteriaProfile,
  AssistantDailyAutomation,
  AssistantMemoryEntry,
  Company,
  Employee,
  EmployeeRole,
  WorkflowDefinition,
} from "./types";
import { DEFAULT_KNOCK_COLORS } from "./knocker/colors";

export const HRM_LAT = 44.6488;
export const HRM_LON = -63.5752;

const ROLE_ACCOUNTS: Array<{
  id: string;
  name: string;
  login: string;
  role: EmployeeRole;
  email: string;
}> = [
  { id: "emp-admin", name: "Admin User", login: "admin", role: "admin", email: "admin@bhcontracting.ca" },
  { id: "emp-manager", name: "Ops Manager", login: "manager", role: "manager", email: "manager@bhcontracting.ca" },
  { id: "emp-sales", name: "Sales Desk", login: "sales", role: "sales", email: "sales@bhcontracting.ca" },
  { id: "emp-knocker", name: "Canvass Lead", login: "knocker", role: "knocker", email: "knocker@bhcontracting.ca" },
  { id: "emp-field", name: "Field Crew", login: "field", role: "field", email: "field@bhcontracting.ca" },
  { id: "emp-office", name: "Office Staff", login: "office", role: "office", email: "office@bhcontracting.ca" },
  { id: "emp-driver", name: "Fleet Driver", login: "driver", role: "driver", email: "driver@bhcontracting.ca" },
];

function makeEmployee(row: (typeof ROLE_ACCOUNTS)[number]): Employee {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    login: row.login,
    pin: DEFAULT_STAFF_PIN,
    passwordHash: null,
    mustChangePassword: true,
    role: row.role,
    phone: "(902) 809-9412",
    hireDate: new Date().toISOString().slice(0, 10),
    hourlyRate: row.role === "admin" ? 45 : row.role === "manager" ? 38 : 26,
    active: true,
  };
}

export function buildProductionSeed(): AppData {
  const now = new Date().toISOString();
  const employees = ROLE_ACCOUNTS.map(makeEmployee);

  const companies: Company[] = [
    {
      id: "co-bhc",
      name: "BH Contracting LTD.",
      domain: "bhcontracting.ca",
      industry: "General contracting",
      phone: "(902) 809-9412",
      address: "1800 Argyle St",
      city: "Halifax, NS",
      notes: "Halifax Regional Municipality",
      createdAt: now,
    },
  ];

  const assistantProfiles: AssistantCriteriaProfile[] = [
    {
      id: "hrm-default",
      name: "HRM residential & commercial",
      jobTypes: ["residential", "commercial"],
      regions: ["Halifax", "Dartmouth", "Bedford", "Sackville", "Cole Harbour"],
      keywords: ["roof", "siding", "deck", "renovation", "storm"],
      minLeadScore: 40,
      outreachTone: "Professional Nova Scotia contractor.",
      enabled: true,
      updatedAt: now,
    },
  ];

  const assistantMemory: AssistantMemoryEntry[] = [
    {
      id: "mem-hrm-1",
      topic: "company",
      content: "BH Contracting LTD. serves Halifax Regional Municipality, Nova Scotia.",
      tags: ["hrm", "operations"],
      source: "production_seed",
      createdAt: now,
      authorId: "emp-admin",
    },
  ];

  const assistantAutomations: AssistantDailyAutomation[] = [
    {
      id: "auto-pipeline",
      name: "Morning pipeline scan",
      description: "Summarize open leads and jobs",
      enabled: true,
      runHour: 7,
      action: "pipeline_scan",
      lastRunAt: null,
    },
  ];

  const workflows: WorkflowDefinition[] = [
    {
      id: "wf-new-lead",
      name: "New lead — assign sales",
      description: "Assign new leads to sales desk",
      enabled: true,
      trigger: "lead_created",
      triggerConfig: {},
      actions: [{ type: "assign_lead", config: { assigneeId: "emp-sales" } }],
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    employees,
    leads: [],
    jobs: [],
    vehicles: [
      {
        id: "veh-1",
        name: "Crew truck #1",
        plate: "NS BHC 01",
        type: "Pickup",
        driverId: "emp-driver",
        lat: HRM_LAT,
        lng: HRM_LON,
        status: "active",
        lastUpdate: now,
        odometer: 42000,
      },
    ],
    timeEntries: [],
    canvassStops: [],
    zones: [
      {
        id: "zone-halifax",
        name: "Halifax Peninsula",
        neighborhood: "North End",
        city: "Halifax",
        description: "Primary canvass zone",
        status: "active",
        assignedKnockerIds: ["emp-knocker"],
        targetDoors: 100,
        centerLat: 44.65,
        centerLng: -63.58,
        colorHex: "#ff2a2a",
        createdAt: now,
      },
    ],
    knocks: [],
    knockTerritories: [],
    knockTags: [
      { id: "tag-roof", label: "Roof", color: "#64748b" },
      { id: "tag-storm", label: "Storm damage", color: "#ef4444" },
    ],
    knockProducts: [],
    knockServices: [],
    knockTodos: [],
    knockProposals: [],
    knockChat: [],
    knockRepLocations: [],
    knockColorCodes: DEFAULT_KNOCK_COLORS,
    knockCalendarEvents: [],
    webhookEndpoints: [],
    webhookDeliveries: [],
    pushSubscriptions: [],
    notifications: [],
    gpsConfig: {
      distanceFilterMeters: 25,
      desiredAccuracy: "balanced",
      enabled: true,
      wakeLock: true,
    },
    materials: [],
    fuelLogs: [
      {
        id: "fuel-travel-uniacke",
        kind: "travel",
        vehicleId: "veh-1",
        employeeId: "emp-driver",
        gallons: 0,
        cost: travelCost(UNIACKE_SITE_TRAVEL.distanceKm),
        odometer: 42070,
        station: "Travel / mileage",
        filledAt: now,
        notes: UNIACKE_SITE_TRAVEL.notes,
        fromAddress: UNIACKE_SITE_TRAVEL.fromAddress,
        toAddress: UNIACKE_SITE_TRAVEL.toAddress,
        distanceKm: UNIACKE_SITE_TRAVEL.distanceKm,
        ratePerKm: UNIACKE_SITE_TRAVEL.ratePerKm,
      },
    ],
    projections: [],
    announcements: [
      {
        id: "ann-welcome",
        title: "BH Contracting LTD. workspace",
        body: "Manage team accounts under Admin → Team. Default first-time PIN is 0000 — you will be prompted to set a password.",
        authorId: "emp-admin",
        pinned: true,
        audienceRoles: [],
        createdAt: now,
      },
    ],
    tools: [],
    toolCheckouts: [],
    inventory: [],
    inventoryTxns: [],
    damageReports: [],
    jobProgress: [],
    invoices: [],
    companies,
    deals: [],
    activities: [],
    tickets: [],
    shifts: [],
    workflows,
    workflowRuns: [],
    sequences: [],
    sequenceEnrollments: [],
    outreachQueue: [],
    assistantProfiles,
    assistantAutomations,
    assistantAudit: [
      { id: "audit-seed", action: "production_seed", detail: "HRM production seed", createdAt: now },
    ],
    assistantMemory,
    contracts: [],
  };
}
