export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "estimate"
  | "won"
  | "lost";

export type JobStatus =
  | "scheduled"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "invoiced";

export type JobType = "residential" | "commercial";

export type EmployeeRole =
  | "admin"
  | "manager"
  | "sales"
  | "knocker"
  | "field"
  | "office"
  | "driver";

export type CanvassOutcome =
  | "not_home"
  | "interested"
  | "appointment"
  | "not_interested"
  | "do_not_knock";

export type ZoneStatus = "open" | "active" | "completed" | "paused";

/** Granular section permissions — drives nav + route gates */
export type Permission =
  | "dashboard"
  | "stats"
  | "leads"
  | "jobs"
  | "materials"
  | "inventory"
  | "tools"
  | "damage"
  | "progress"
  | "invoices"
  | "zones"
  | "canvass"
  | "fleet"
  | "fuel"
  | "hours"
  | "users"
  | "team"
  | "board"
  | "board_post"
  | "apps"
  | "knocker"
  | "clock"
  | "manage_users"
  | "manage_zones"
  | "ai_summarize";

export type ToolStatus = "available" | "checked_out" | "damaged" | "retired";
export type InventoryTxnType = "receive" | "issue" | "adjust" | "return";
export type DamageSeverity = "low" | "medium" | "high" | "critical";
export type DamageTarget = "tool" | "vehicle" | "material" | "job_site" | "other";
export type InvoiceKind = "invoice" | "full_report";
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export interface ToolAsset {
  id: string;
  name: string;
  category: string;
  assetTag: string;
  status: ToolStatus;
  checkedOutToId: string | null;
  checkedOutAt: string | null;
  jobId: string | null;
  notes: string;
}

export interface ToolCheckout {
  id: string;
  toolId: string;
  employeeId: string;
  jobId: string | null;
  checkedOutAt: string;
  checkedInAt: string | null;
  notes: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  quantityOnHand: number;
  reorderLevel: number;
  unitCost: number;
  location: string;
}

export interface InventoryTxn {
  id: string;
  itemId: string;
  type: InventoryTxnType;
  quantity: number;
  jobId: string | null;
  employeeId: string;
  notes: string;
  createdAt: string;
}

export interface DamageReport {
  id: string;
  targetType: DamageTarget;
  targetId: string | null;
  targetLabel: string;
  jobId: string | null;
  reportedById: string;
  severity: DamageSeverity;
  description: string;
  imageDataUrls: string[];
  createdAt: string;
  resolved: boolean;
}

export interface JobProgressEntry {
  id: string;
  jobId: string;
  authorId: string;
  notes: string;
  imageDataUrls: string[];
  aiSummary: string | null;
  createdAt: string;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceDoc {
  id: string;
  jobId: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  customerName: string;
  lines: InvoiceLine[];
  /** Include progress notes/images when kind === full_report */
  includeProgress: boolean;
  progressEntryIds: string[];
  notes: string;
  aiSummary: string | null;
  createdAt: string;
  createdById: string;
}
export interface Employee {
  id: string;
  name: string;
  email: string;
  /** Login username (usually email local-part) */
  login: string;
  /** Simple PIN for demo / field login */
  pin: string;
  role: EmployeeRole;
  phone: string;
  hireDate: string;
  hourlyRate: number;
  active: boolean;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  source: string;
  status: LeadStatus;
  jobType: JobType;
  notes: string;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Job {
  id: string;
  title: string;
  customerName: string;
  address: string;
  jobType: JobType;
  status: JobStatus;
  leadId: string | null;
  crewLeadId: string | null;
  startDate: string;
  estimatedValue: number;
  contractValue: number;
  notes: string;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  type: string;
  driverId: string | null;
  lat: number;
  lng: number;
  status: "active" | "idle" | "maintenance";
  lastUpdate: string;
  odometer: number;
}

export interface TimeEntry {
  id: string;
  employeeId: string;
  clockIn: string;
  clockOut: string | null;
  jobId: string | null;
  notes: string;
}

export interface CanvassStop {
  id: string;
  address: string;
  city: string;
  outcome: CanvassOutcome;
  notes: string;
  salesRepId: string;
  leadId: string | null;
  createdAt: string;
  zoneId?: string | null;
}

export interface KnockZone {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  description: string;
  status: ZoneStatus;
  assignedKnockerIds: string[];
  targetDoors: number;
  centerLat: number;
  centerLng: number;
  createdAt: string;
}

export interface KnockEvent {
  id: string;
  zoneId: string;
  knockerId: string;
  address: string;
  outcome: CanvassOutcome;
  notes: string;
  leadId: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}

export interface MaterialCost {
  id: string;
  jobId: string;
  description: string;
  vendor: string;
  quantity: number;
  unitCost: number;
  purchasedAt: string;
  notes: string;
}

export interface FuelLog {
  id: string;
  vehicleId: string;
  employeeId: string;
  gallons: number;
  cost: number;
  odometer: number;
  station: string;
  filledAt: string;
  notes: string;
}

export interface SalesProjection {
  id: string;
  month: string;
  projectedRevenue: number;
  projectedJobs: number;
  projectedKnocks: number;
  notes: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  authorId: string;
  pinned: boolean;
  /** Empty = everyone; otherwise role allow-list */
  audienceRoles: EmployeeRole[];
  createdAt: string;
}

export interface AppData {
  employees: Employee[];
  leads: Lead[];
  jobs: Job[];
  vehicles: Vehicle[];
  timeEntries: TimeEntry[];
  canvassStops: CanvassStop[];
  zones: KnockZone[];
  knocks: KnockEvent[];
  materials: MaterialCost[];
  fuelLogs: FuelLog[];
  projections: SalesProjection[];
  announcements: Announcement[];
  tools: ToolAsset[];
  toolCheckouts: ToolCheckout[];
  inventory: InventoryItem[];
  inventoryTxns: InventoryTxn[];
  damageReports: DamageReport[];
  jobProgress: JobProgressEntry[];
  invoices: InvoiceDoc[];
}

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  admin: "Admin",
  manager: "Manager",
  sales: "Sales",
  knocker: "Knocker",
  field: "Field crew",
  office: "Office",
  driver: "Driver",
};

const ALL_ADMIN: Permission[] = [
  "dashboard",
  "stats",
  "leads",
  "jobs",
  "materials",
  "inventory",
  "tools",
  "damage",
  "progress",
  "invoices",
  "zones",
  "canvass",
  "fleet",
  "fuel",
  "hours",
  "users",
  "team",
  "board",
  "board_post",
  "apps",
  "knocker",
  "clock",
  "manage_users",
  "manage_zones",
  "ai_summarize",
];

export const ROLE_PERMISSIONS: Record<EmployeeRole, Permission[]> = {
  admin: ALL_ADMIN,
  manager: ALL_ADMIN.filter((p) => p !== "manage_users" && p !== "users"),
  sales: [
    "dashboard",
    "stats",
    "leads",
    "canvass",
    "zones",
    "board",
    "apps",
    "knocker",
    "clock",
    "progress",
    "invoices",
  ],
  knocker: ["board", "zones", "apps", "knocker", "clock"],
  field: [
    "board",
    "jobs",
    "hours",
    "apps",
    "clock",
    "tools",
    "damage",
    "progress",
    "ai_summarize",
  ],
  office: [
    "dashboard",
    "stats",
    "leads",
    "jobs",
    "materials",
    "inventory",
    "tools",
    "damage",
    "progress",
    "invoices",
    "hours",
    "team",
    "board",
    "board_post",
    "apps",
    "clock",
    "ai_summarize",
  ],
  driver: ["board", "fleet", "fuel", "apps", "clock", "tools", "damage"],
};

export const ADMIN_NAV: Array<{
  href: string;
  label: string;
  perm: Permission;
}> = [
  { href: "/admin/dashboard", label: "Ops wall", perm: "dashboard" },
  { href: "/admin/board", label: "Announcements", perm: "board" },
  { href: "/admin/stats", label: "Statistics", perm: "stats" },
  { href: "/admin/leads", label: "Leads", perm: "leads" },
  { href: "/admin/jobs", label: "Jobs", perm: "jobs" },
  { href: "/admin/progress", label: "Job progress", perm: "progress" },
  { href: "/admin/invoices", label: "Invoices", perm: "invoices" },
  { href: "/admin/materials", label: "Job materials", perm: "materials" },
  { href: "/admin/inventory", label: "Inventory", perm: "inventory" },
  { href: "/admin/tools", label: "Tools", perm: "tools" },
  { href: "/admin/damage", label: "Damage", perm: "damage" },
  { href: "/admin/zones", label: "Knocker zones", perm: "zones" },
  { href: "/admin/canvass", label: "Door-to-Door", perm: "canvass" },
  { href: "/admin/fleet", label: "Fleet", perm: "fleet" },
  { href: "/admin/fuel", label: "Fuel", perm: "fuel" },
  { href: "/admin/hours", label: "Hours & Payroll", perm: "hours" },
  { href: "/admin/users", label: "Users & roles", perm: "users" },
  { href: "/admin/team", label: "Team", perm: "team" },
];

export function homeForRole(role: EmployeeRole): string {
  const perms = ROLE_PERMISSIONS[role] || [];
  if (perms.includes("dashboard")) return "/admin/dashboard";
  if (perms.includes("apps")) return "/apps";
  if (perms.includes("board")) return "/apps/board";
  return "/login";
}
