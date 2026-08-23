import type { AppData, Job, LeadStatus } from "./types";

export type DeckView = "sales" | "install" | "admin" | "network";

export const DECK_TONE_STROKE: Record<string, string> = {
  red: "#ff2a2a",
  orange: "#ff7b00",
  amber: "#ffc107",
  green: "#39ff14",
  pink: "#ff3d8a",
  cyan: "#00e5ff",
};

export type DeckNode = {
  id: string;
  label: string;
  sub?: string;
  tone: "red" | "orange" | "amber" | "green" | "pink" | "cyan";
  x: number;
  y: number;
};

export type DeckEdge = {
  from: string;
  to: string;
  tone: DeckNode["tone"];
  curved?: boolean;
};

const STATUS_ORDER: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "estimate",
  "won",
  "lost",
];

export function buildSalesTree(data: AppData): { nodes: DeckNode[]; edges: DeckEdge[] } {
  const nodes: DeckNode[] = [
    { id: "root", label: "PIPELINE", sub: `${data.leads.length} leads`, tone: "red", x: 50, y: 8 },
  ];
  const edges: DeckEdge[] = [];
  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    leads: data.leads.filter((l) => l.status === status),
  })).filter((g) => g.leads.length > 0);

  const cols = byStatus.length || 1;
  byStatus.forEach((group, i) => {
    const x = 15 + (i / Math.max(cols - 1, 1)) * 70;
    const id = `st-${group.status}`;
    nodes.push({
      id,
      label: group.status.toUpperCase(),
      sub: String(group.leads.length),
      tone: group.status === "won" ? "green" : group.status === "lost" ? "orange" : "amber",
      x,
      y: 28,
    });
    edges.push({ from: "root", to: id, tone: "red" });

    group.leads.slice(0, 3).forEach((lead, j) => {
      const lid = `lead-${lead.id}`;
      const offset = (j - 1) * 8;
      nodes.push({
        id: lid,
        label: lead.name.split(" ")[0].toUpperCase(),
        sub: String(lead.leadScore),
        tone: "orange",
        x: x + offset,
        y: 48 + j * 10,
      });
      edges.push({ from: id, to: lid, tone: "orange" });
    });
  });

  return { nodes, edges };
}

export function buildInstallGrid(data: AppData): Job[] {
  return data.jobs.filter(
    (j) => j.status === "scheduled" || j.status === "in_progress",
  );
}

export function buildAdminKpis(data: AppData) {
  return [
    {
      label: "ACTIVE JOBS",
      value: data.jobs.filter((j) => j.status === "in_progress").length,
    },
    {
      label: "OPEN LEADS",
      value: data.leads.filter((l) => !["won", "lost"].includes(l.status)).length,
    },
    {
      label: "CREW IN",
      value: data.timeEntries.filter((t) => !t.clockOut).length,
    },
    {
      label: "OPEN POOL",
      value: data.shifts.filter(
        (s) => s.status === "open_pool" || (s.status === "overtime" && !s.claimedById),
      ).length,
    },
    {
      label: "TICKETS",
      value: data.tickets.filter((t) => t.status !== "closed").length,
    },
    {
      label: "OUTREACH",
      value: data.outreachQueue.filter((o) => o.status === "pending_approval").length,
    },
  ];
}

export function buildNetworkGraph(data: AppData): { nodes: DeckNode[]; edges: DeckEdge[] } {
  const nodes: DeckNode[] = [
    { id: "sales", label: "SALES", sub: String(data.leads.length), tone: "pink", x: 22, y: 22 },
    { id: "install", label: "INSTALL", sub: String(data.jobs.length), tone: "green", x: 78, y: 20 },
    { id: "field", label: "FIELD", sub: String(data.employees.filter((e) => e.role === "field").length), tone: "amber", x: 50, y: 42 },
    { id: "fleet", label: "FLEET", sub: String(data.vehicles.length), tone: "cyan", x: 18, y: 58 },
    { id: "admin", label: "ADMIN", sub: String(data.employees.filter((e) => e.role === "admin" || e.role === "manager").length), tone: "red", x: 82, y: 55 },
    { id: "canvass", label: "KNOCK", sub: String(data.knocks.length), tone: "orange", x: 50, y: 72 },
  ];
  const edges: DeckEdge[] = [
    { from: "sales", to: "install", tone: "pink", curved: true },
    { from: "sales", to: "canvass", tone: "orange", curved: true },
    { from: "install", to: "field", tone: "green", curved: true },
    { from: "field", to: "fleet", tone: "amber", curved: true },
    { from: "install", to: "admin", tone: "red", curved: true },
    { from: "canvass", to: "sales", tone: "pink", curved: true },
    { from: "admin", to: "sales", tone: "red", curved: true },
  ];
  return { nodes, edges };
}

export function deckViewHref(view: DeckView): string {
  switch (view) {
    case "sales":
      return "/admin/sales?tab=pipeline";
    case "install":
      return "/admin/jobs";
    case "admin":
      return "/admin/stats";
    case "network":
      return "/admin/sales";
    default:
      return "/admin/dashboard";
  }
}
