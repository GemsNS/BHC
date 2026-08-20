import type { AppData } from "./types";

export function buildSeedData(): AppData {
  const now = new Date();
  const iso = (daysAgo: number, hour = 9) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  const employees = [
    {
      id: "emp-admin",
      name: "Jordan Hale",
      email: "jordan@bighoss.com",
      role: "admin" as const,
      phone: "(555) 100-0001",
      hireDate: "2021-03-15",
      hourlyRate: 42,
      active: true,
    },
    {
      id: "emp-sales-1",
      name: "Alex Rivera",
      email: "alex@bighoss.com",
      role: "sales" as const,
      phone: "(555) 100-0002",
      hireDate: "2022-06-01",
      hourlyRate: 28,
      active: true,
    },
    {
      id: "emp-field-1",
      name: "Sam Ortiz",
      email: "sam@bighoss.com",
      role: "field" as const,
      phone: "(555) 100-0003",
      hireDate: "2020-09-12",
      hourlyRate: 32,
      active: true,
    },
    {
      id: "emp-field-2",
      name: "Casey Brooks",
      email: "casey@bighoss.com",
      role: "field" as const,
      phone: "(555) 100-0004",
      hireDate: "2023-01-20",
      hourlyRate: 26,
      active: true,
    },
    {
      id: "emp-driver-1",
      name: "Riley Quinn",
      email: "riley@bighoss.com",
      role: "driver" as const,
      phone: "(555) 100-0005",
      hireDate: "2022-11-08",
      hourlyRate: 24,
      active: true,
    },
  ];

  const leads = [
    {
      id: "lead-1",
      name: "Morgan Ellis",
      phone: "(555) 220-4411",
      email: "morgan.ellis@email.com",
      address: "14 Harbor Lane",
      city: "Seaside",
      source: "Door-to-door",
      status: "estimate" as const,
      jobType: "residential" as const,
      notes: "Wants deck rebuild + new exterior trim. Coastal exposure.",
      assignedToId: "emp-sales-1",
      createdAt: iso(12),
      updatedAt: iso(2),
    },
    {
      id: "lead-2",
      name: "Bayfront Properties LLC",
      phone: "(555) 330-8822",
      email: "ops@bayfrontprops.com",
      address: "880 Commerce Blvd",
      city: "Harbor City",
      source: "Referral",
      status: "qualified" as const,
      jobType: "commercial" as const,
      notes: "Storefront envelope upgrade, phased over 3 weekends.",
      assignedToId: "emp-sales-1",
      createdAt: iso(8),
      updatedAt: iso(1),
    },
    {
      id: "lead-3",
      name: "Dana Chen",
      phone: "(555) 440-1199",
      email: "dana.chen@email.com",
      address: "62 Driftwood Ct",
      city: "Seaside",
      source: "Website",
      status: "new" as const,
      jobType: "residential" as const,
      notes: "Inquiry about renovation + custom exterior.",
      assignedToId: null,
      createdAt: iso(0, 10),
      updatedAt: iso(0, 10),
    },
  ];

  const jobs = [
    {
      id: "job-1",
      title: "Harbor Lane deck + envelope",
      customerName: "Morgan Ellis",
      address: "14 Harbor Lane, Seaside",
      jobType: "residential" as const,
      status: "scheduled" as const,
      leadId: "lead-1",
      crewLeadId: "emp-field-1",
      startDate: iso(-3).slice(0, 10),
      estimatedValue: 28500,
      notes: "Material staging Thursday. Check coastal fasteners.",
      createdAt: iso(5),
    },
    {
      id: "job-2",
      title: "Commerce Blvd storefront phase 1",
      customerName: "Bayfront Properties LLC",
      address: "880 Commerce Blvd, Harbor City",
      jobType: "commercial" as const,
      status: "in_progress" as const,
      leadId: "lead-2",
      crewLeadId: "emp-field-1",
      startDate: iso(1).slice(0, 10),
      estimatedValue: 64000,
      notes: "Night work window 6pm–11pm.",
      createdAt: iso(4),
    },
  ];

  const vehicles = [
    {
      id: "veh-1",
      name: "Box Truck 01",
      plate: "BHC-101",
      type: "box truck",
      driverId: "emp-driver-1",
      lat: 36.9741,
      lng: -122.0308,
      status: "active" as const,
      lastUpdate: iso(0, 8),
    },
    {
      id: "veh-2",
      name: "Crew Van 02",
      plate: "BHC-204",
      type: "van",
      driverId: "emp-field-2",
      lat: 36.968,
      lng: -122.01,
      status: "idle" as const,
      lastUpdate: iso(0, 7),
    },
    {
      id: "veh-3",
      name: "Utility Trailer",
      plate: "BHC-T3",
      type: "trailer",
      driverId: null,
      lat: 36.9715,
      lng: -122.025,
      status: "maintenance" as const,
      lastUpdate: iso(1, 16),
    },
  ];

  const timeEntries = [
    {
      id: "time-1",
      employeeId: "emp-field-1",
      clockIn: iso(1, 7),
      clockOut: iso(1, 16),
      jobId: "job-2",
      notes: "Commerce Blvd phase 1",
    },
    {
      id: "time-2",
      employeeId: "emp-field-2",
      clockIn: iso(1, 7),
      clockOut: iso(1, 15),
      jobId: "job-2",
      notes: "",
    },
  ];

  const canvassStops = [
    {
      id: "can-1",
      address: "18 Harbor Lane",
      city: "Seaside",
      outcome: "interested" as const,
      notes: "Wants call back about decks.",
      salesRepId: "emp-sales-1",
      leadId: null,
      createdAt: iso(0, 11),
    },
    {
      id: "can-2",
      address: "22 Harbor Lane",
      city: "Seaside",
      outcome: "not_home" as const,
      notes: "",
      salesRepId: "emp-sales-1",
      leadId: null,
      createdAt: iso(0, 11),
    },
    {
      id: "can-3",
      address: "14 Harbor Lane",
      city: "Seaside",
      outcome: "appointment" as const,
      notes: "Converted to lead Morgan Ellis.",
      salesRepId: "emp-sales-1",
      leadId: "lead-1",
      createdAt: iso(12, 14),
    },
  ];

  return { employees, leads, jobs, vehicles, timeEntries, canvassStops };
}
