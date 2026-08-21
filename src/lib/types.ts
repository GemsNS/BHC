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

/** App roles for BHC subcontracting ops */
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

export interface Employee {
  id: string;
  name: string;
  email: string;
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
  /** Contract / bid value for projections */
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
  /** Current odometer reading */
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

/** Neighborhood / turf for the Knocker app */
export interface KnockZone {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  description: string;
  status: ZoneStatus;
  assignedKnockerIds: string[];
  targetDoors: number;
  /** Optional bounding hint for map placeholder */
  centerLat: number;
  centerLng: number;
  createdAt: string;
}

/** Individual door knock logged from the Knocker app */
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
  /** YYYY-MM */
  month: string;
  projectedRevenue: number;
  projectedJobs: number;
  projectedKnocks: number;
  notes: string;
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

export const ROLE_PERMISSIONS: Record<
  EmployeeRole,
  Array<
    | "admin"
    | "apps"
    | "knocker"
    | "clock"
    | "manage_users"
    | "manage_zones"
    | "view_stats"
  >
> = {
  admin: [
    "admin",
    "apps",
    "knocker",
    "clock",
    "manage_users",
    "manage_zones",
    "view_stats",
  ],
  manager: [
    "admin",
    "apps",
    "knocker",
    "clock",
    "manage_zones",
    "view_stats",
  ],
  sales: ["apps", "knocker", "clock", "view_stats"],
  knocker: ["apps", "knocker", "clock"],
  field: ["apps", "clock"],
  office: ["admin", "apps", "clock", "view_stats"],
  driver: ["apps", "clock"],
};
