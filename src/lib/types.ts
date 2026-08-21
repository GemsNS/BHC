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
  | "manage_zones";

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
  ],
  knocker: ["board", "zones", "apps", "knocker", "clock"],
  field: ["board", "jobs", "hours", "apps", "clock"],
  office: [
    "dashboard",
    "stats",
    "leads",
    "jobs",
    "materials",
    "hours",
    "team",
    "board",
    "board_post",
    "apps",
    "clock",
  ],
  driver: ["board", "fleet", "fuel", "apps", "clock"],
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
  { href: "/admin/materials", label: "Materials", perm: "materials" },
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
