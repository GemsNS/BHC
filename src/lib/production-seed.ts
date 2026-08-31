/**
 * Production seed — clean Halifax Regional Municipality CRM starter.
 * No US demo cities, no fake pipeline volume. Mainframe AI fills the rest.
 */

import { randomInt } from "crypto";
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

/** Halifax Regional Municipality center */
export const HRM_LAT = 44.6488;
export const HRM_LON = -63.5752;

export type StaffCredential = {
  name: string;
  login: string;
  pin: string;
  role: string;
  email: string;
};

function pin(): string {
  return String(randomInt(100000, 999999));
}

function staff(
  id: string,
  name: string,
  login: string,
  role: EmployeeRole,
  email: string,
): { employee: Employee; credential: StaffCredential } {
  const generatedPin = pin();
  return {
    employee: {
      id,
      name,
      email,
      login,
      pin: generatedPin,
      role,
      phone: `(902) 555-${String(randomInt(1000, 9999))}`,
      hireDate: new Date().toISOString().slice(0, 10),
      hourlyRate: role === "admin" ? 45 : role === "manager" ? 38 : 26,
      active: true,
    },
    credential: {
      name,
      login,
      pin: generatedPin,
      role,
      email,
    },
  };
}

export function buildProductionSeed(): { data: AppData; credentials: StaffCredential[] } {
  const now = new Date().toISOString();
  const creds: StaffCredential[] = [];

  const roster = [
    staff("emp-admin", "Liam MacLeod", "liam", "admin", "liam@bhcontracting.co"),
    staff("emp-manager", "Sarah O'Brien", "sarah", "manager", "sarah@bhcontracting.co"),
    staff("emp-sales-1", "Noah Sullivan", "noah", "sales", "noah@bhcontracting.co"),
    staff("emp-knocker-1", "Emma Fraser", "emma", "knocker", "emma@bhcontracting.co"),
    staff("emp-knocker-2", "James Corbett", "james", "knocker", "james@bhcontracting.co"),
    staff("emp-field-1", "Olivia MacDonald", "olivia", "field", "olivia@bhcontracting.co"),
    staff("emp-field-2", "Ethan Boutilier", "ethan", "field", "ethan@bhcontracting.co"),
    staff("emp-driver-1", "Maya Singh", "maya", "driver", "maya@bhcontracting.co"),
  ];

  const employees = roster.map((r) => {
    creds.push(r.credential);
    return r.employee;
  });

  const companies: Company[] = [
    {
      id: "co-bhc",
      name: "BH Contracting Co.",
      domain: "bhcontracting.co",
      industry: "General contracting",
      phone: "(902) 555-0100",
      address: "1800 Argyle St",
      city: "Halifax, NS",
      notes: "Head office — Halifax Regional Municipality",
      createdAt: now,
    },
  ];

  const assistantProfiles: AssistantCriteriaProfile[] = [
    {
      id: "hrm-default",
      name: "HRM residential & commercial",
      jobTypes: ["residential", "commercial"],
      regions: [
        "Halifax",
        "Dartmouth",
        "Bedford",
        "Sackville",
        "Cole Harbour",
        "Clayton Park",
        "Spryfield",
        "Eastern Passage",
        "Lower Sackville",
        "Fall River",
      ],
      keywords: ["roof", "siding", "deck", "renovation", "storm", "insurance", "envelope"],
      minLeadScore: 40,
      outreachTone:
        "Professional, local Nova Scotia contractor. Reference HRM weather and building season.",
      enabled: true,
      updatedAt: now,
    },
  ];

  const assistantMemory: AssistantMemoryEntry[] = [
    {
      id: "mem-hrm-1",
      topic: "service area",
      content:
        "BH Contracting Co. serves Halifax Regional Municipality (HRM), Nova Scotia, Canada. Primary office Halifax peninsula. Common job types: roofing, siding, decks, storm repair, commercial envelope.",
      tags: ["hrm", "halifax", "operations"],
      source: "production_seed",
      createdAt: now,
      authorId: "emp-admin",
    },
    {
      id: "mem-hrm-2",
      topic: "public data",
      content:
        "Use lookup_hrm for Open-Meteo weather and OpenStreetMap Nominatim geocoding in Nova Scotia. Default map center 44.6488, -63.5752.",
      tags: ["api", "geocoding", "weather"],
      source: "production_seed",
      createdAt: now,
      authorId: null,
    },
  ];

  const assistantAutomations: AssistantDailyAutomation[] = [
    {
      id: "auto-pipeline",
      name: "Morning pipeline scan",
      description: "Summarize open leads and jobs in HRM",
      enabled: true,
      runHour: 7,
      action: "pipeline_scan",
      lastRunAt: null,
    },
    {
      id: "auto-hunt",
      name: "Prospect hunt",
      description: "Queue outreach drafts for matching HRM leads",
      enabled: true,
      runHour: 8,
      action: "prospect_hunt",
      lastRunAt: null,
    },
    {
      id: "auto-sequences",
      name: "Process sequences",
      description: "Run due sales sequence steps",
      enabled: true,
      runHour: 9,
      action: "process_sequences",
      lastRunAt: null,
    },
  ];

  const workflows: WorkflowDefinition[] = [
    {
      id: "wf-new-lead",
      name: "New lead — assign & task",
      description: "When a lead is created, assign to sales and create follow-up task",
      enabled: true,
      trigger: "lead_created",
      triggerConfig: {},
      actions: [
        { type: "assign_lead", config: { assigneeId: "emp-sales-1" } },
        {
          type: "create_task",
          config: { subject: "First contact — new HRM lead", dueDays: "1" },
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "wf-qualified",
      name: "Qualified — schedule estimate",
      description: "Create estimate task when lead is qualified",
      enabled: true,
      trigger: "lead_status_changed",
      triggerConfig: { status: "qualified" },
      actions: [
        {
          type: "create_task",
          config: { subject: "Book on-site estimate", dueDays: "2" },
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];

  const data: AppData = {
    employees,
    leads: [],
    jobs: [],
    vehicles: [
      {
        id: "veh-1",
        name: "Crew truck #1",
        plate: "NS BHC 01",
        type: "Pickup",
        driverId: "emp-driver-1",
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
        id: "zone-hrm-north",
        name: "Halifax Peninsula — North",
        neighborhood: "North End",
        city: "Halifax",
        description: "Downtown north / Hydrostone canvass zone",
        status: "active",
        assignedKnockerIds: ["emp-knocker-1"],
        targetDoors: 120,
        centerLat: 44.65,
        centerLng: -63.58,
        polygon: [
          [44.655, -63.59],
          [44.655, -63.57],
          [44.645, -63.57],
          [44.645, -63.59],
        ],
        colorHex: "#ff2a2a",
        createdAt: now,
      },
      {
        id: "zone-dartmouth",
        name: "Dartmouth — Downtown",
        neighborhood: "Downtown Dartmouth",
        city: "Dartmouth",
        description: "Portland St / Alderney canvass zone",
        status: "active",
        assignedKnockerIds: ["emp-knocker-2"],
        targetDoors: 100,
        centerLat: 44.667,
        centerLng: -63.565,
        polygon: [
          [44.672, -63.58],
          [44.672, -63.55],
          [44.662, -63.55],
          [44.662, -63.58],
        ],
        colorHex: "#3b82f6",
        createdAt: now,
      },
    ],
    knocks: [],
    knockTerritories: [],
    knockTags: [
      { id: "tag-roof", label: "Roof: asphalt shingle", color: "#64748b" },
      { id: "tag-storm", label: "Storm / wind damage", color: "#ef4444" },
      { id: "tag-deck", label: "Deck / exterior", color: "#22c55e" },
      { id: "tag-commercial", label: "Commercial property", color: "#8b5cf6" },
    ],
    knockProducts: [
      {
        id: "prod-roof",
        name: "Architectural shingle roof",
        sku: "RF-NS-200",
        unitPrice: 28000,
        category: "Roofing",
      },
      {
        id: "prod-siding",
        name: "Fiber cement siding",
        sku: "SD-NS-300",
        unitPrice: 35000,
        category: "Envelope",
      },
      {
        id: "prod-deck",
        name: "Composite deck package",
        sku: "DK-NS-100",
        unitPrice: 22000,
        category: "Decks",
      },
    ],
    knockServices: [
      {
        id: "svc-estimate",
        name: "On-site estimate",
        description: "Free property walkthrough in HRM",
        basePrice: 0,
      },
      {
        id: "svc-storm",
        name: "Storm damage assessment",
        description: "Documentation for insurance claims",
        basePrice: 350,
      },
    ],
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
    fuelLogs: [],
    projections: [],
    announcements: [
      {
        id: "ann-welcome",
        title: "Production workspace live",
        body: "CRM reset for Halifax Regional Municipality. Use Mainframe AI to import leads, jobs, and company knowledge. Staff credentials were issued at seed time.",
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
      {
        id: "audit-seed",
        action: "production_seed",
        detail: "Clean HRM production seed applied",
        createdAt: now,
      },
    ],
    assistantMemory,
  };

  return { data, credentials: creds };
}
