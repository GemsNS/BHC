import type { AppData, Employee } from "./types";
import { formatCurrency, labelize } from "./utils";
import type { AlertItem, FeedItemData, MetricItem } from "@/components/cc";

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function empName(employees: Employee[], id: string | null | undefined): string {
  if (!id) return "Staff";
  return employees.find((e) => e.id === id)?.name || "Staff";
}

export function buildOpsMetrics(data: AppData): MetricItem[] {
  const openLeads = data.leads.filter((l) => !["won", "lost"].includes(l.status));
  const activeJobs = data.jobs.filter((j) =>
    ["scheduled", "in_progress", "on_hold"].includes(j.status),
  );
  const knocksToday = data.knocks.filter((k) => isToday(k.createdAt)).length;
  const clockedIn = data.timeEntries.filter((t) => t.clockOut === null).length;
  const materialSpend = data.materials.reduce(
    (s, m) => s + m.quantity * m.unitCost,
    0,
  );
  const fuelSpend = data.fuelLogs.reduce((s, f) => s + f.cost, 0);

  return [
    { label: "Open leads", value: openLeads.length },
    { label: "Active jobs", value: activeJobs.length },
    { label: "Knocks today", value: knocksToday, signal: knocksToday > 0 },
    { label: "Clocked in", value: clockedIn, signal: clockedIn > 0 },
    {
      label: "Burn (mat+fuel)",
      value: formatCurrency(materialSpend + fuelSpend),
      hint: `Mat ${formatCurrency(materialSpend)} · Fuel ${formatCurrency(fuelSpend)}`,
    },
  ];
}

export function buildActivityFeed(data: AppData, limit = 14): FeedItemData[] {
  const events: Array<FeedItemData & { sort: string }> = [];

  for (const k of data.knocks) {
    events.push({
      id: `knock-${k.id}`,
      title: `Knock · ${labelize(k.outcome)}`,
      detail: `${k.address} — ${empName(data.employees, k.knockerId)}`,
      time: new Date(k.createdAt).toLocaleString(),
      kind: "knock",
      sort: k.createdAt,
    });
  }

  for (const t of data.timeEntries) {
    const stamp = t.clockOut || t.clockIn;
    events.push({
      id: `time-${t.id}-${t.clockOut ? "out" : "in"}`,
      title: t.clockOut ? "Clock out" : "Clock in",
      detail: empName(data.employees, t.employeeId),
      time: new Date(stamp).toLocaleString(),
      kind: "clock",
      sort: stamp,
    });
  }

  for (const l of data.leads) {
    events.push({
      id: `lead-${l.id}`,
      title: `Lead · ${labelize(l.status)}`,
      detail: `${l.name} · ${l.city || l.address}`,
      time: new Date(l.createdAt).toLocaleString(),
      kind: "lead",
      sort: l.createdAt,
    });
  }

  for (const j of data.jobs) {
    events.push({
      id: `job-${j.id}`,
      title: `Job · ${labelize(j.status)}`,
      detail: j.title,
      time: new Date(j.createdAt).toLocaleString(),
      kind: "job",
      sort: j.createdAt,
    });
  }

  return events
    .sort((a, b) => b.sort.localeCompare(a.sort))
    .slice(0, limit)
    .map(({ sort, ...rest }) => {
      void sort;
      return rest;
    });
}

export function buildOpsAlerts(data: AppData): AlertItem[] {
  const alerts: AlertItem[] = [];

  for (const z of data.zones.filter((z) => z.status === "active")) {
    const count = data.knocks.filter((k) => k.zoneId === z.id).length;
    const pct = z.targetDoors ? count / z.targetDoors : 1;
    if (pct < 0.4) {
      alerts.push({
        id: `zone-${z.id}`,
        label: "Zone lag",
        detail: `${z.name} at ${count}/${z.targetDoors} doors`,
        href: "/admin/zones",
        level: "warn",
      });
    }
  }

  for (const v of data.vehicles.filter((v) => v.status === "maintenance")) {
    alerts.push({
      id: `veh-${v.id}`,
      label: "Fleet",
      detail: `${v.name} in maintenance`,
      href: "/admin/fleet",
      level: "critical",
    });
  }

  const hotLeads = data.leads.filter((l) =>
    ["estimate", "qualified"].includes(l.status),
  );
  if (hotLeads.length) {
    alerts.push({
      id: "hot-leads",
      label: "Pipeline",
      detail: `${hotLeads.length} lead(s) in estimate/qualified`,
      href: "/admin/leads",
      level: "info",
    });
  }

  const longOpen = data.timeEntries.filter((t) => {
    if (t.clockOut) return false;
    const hrs = (Date.now() - new Date(t.clockIn).getTime()) / 36e5;
    return hrs >= 10;
  });
  for (const t of longOpen) {
    alerts.push({
      id: `shift-${t.id}`,
      label: "Shift",
      detail: `${empName(data.employees, t.employeeId)} still clocked in (10h+)`,
      href: "/admin/hours",
      level: "warn",
    });
  }

  const holdJobs = data.jobs.filter((j) => j.status === "on_hold");
  for (const j of holdJobs) {
    alerts.push({
      id: `hold-${j.id}`,
      label: "Job hold",
      detail: j.title,
      href: "/admin/jobs",
      level: "warn",
    });
  }

  return alerts.slice(0, 8);
}

export function buildFieldTodayMetrics(
  data: AppData,
  employeeId: string | undefined,
): MetricItem[] {
  const myKnocks = data.knocks.filter(
    (k) => k.knockerId === employeeId && isToday(k.createdAt),
  ).length;
  const open = data.timeEntries.find(
    (t) => t.employeeId === employeeId && t.clockOut === null,
  );
  const myZones = data.zones.filter(
    (z) =>
      z.status === "active" &&
      employeeId &&
      z.assignedKnockerIds.includes(employeeId),
  ).length;
  const activeJobs = data.jobs.filter((j) =>
    ["scheduled", "in_progress"].includes(j.status),
  ).length;

  return [
    {
      label: "Status",
      value: open ? "ON CLOCK" : "OFF SHIFT",
      signal: !!open,
    },
    { label: "My knocks", value: myKnocks, signal: myKnocks > 0 },
    { label: "My zones", value: myZones },
    { label: "Active jobs", value: activeJobs },
  ];
}
