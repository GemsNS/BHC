import type { Permission } from "./types";

export type NavItem = {
  href: string;
  label: string;
  perm: Permission;
  /** Shorter label for mobile chips */
  short?: string;
};

export type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

/** Grouped admin navigation — fewer top-level names, clearer hierarchy */
export const ADMIN_NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { href: "/admin/dashboard", label: "Command deck", short: "Deck", perm: "dashboard" },
      { href: "/admin/assistant", label: "Mainframe", short: "AI", perm: "dashboard" },
      { href: "/admin/books", label: "Books & P&L", short: "Books", perm: "stats" },
      { href: "/admin/markets", label: "Markets", short: "Mkt", perm: "stats" },
      { href: "/admin/stats", label: "Analytics", short: "Stats", perm: "stats" },
      { href: "/admin/board", label: "Announcements", short: "News", perm: "board" },
    ],
  },
  {
    id: "sales",
    label: "Sales & clients",
    items: [
      {
        href: "/admin/sales",
        label: "Pipeline",
        short: "Sales",
        perm: "leads",
      },
      { href: "/admin/canvass", label: "Canvassing", short: "Doors", perm: "canvass" },
      { href: "/admin/knocker", label: "Active Knocker", short: "Knock", perm: "zones" },
    ],
  },
  {
    id: "delivery",
    label: "Jobs & delivery",
    items: [
      { href: "/admin/jobs", label: "Active jobs", short: "Jobs", perm: "jobs" },
      { href: "/admin/progress", label: "Site updates", short: "Sites", perm: "progress" },
      { href: "/admin/invoices", label: "Billing", short: "Bill", perm: "invoices" },
      { href: "/admin/materials", label: "Job materials", short: "Mat.", perm: "materials" },
    ],
  },
  {
    id: "workforce",
    label: "Workforce",
    items: [
      {
        href: "/admin/schedule",
        label: "Scheduling",
        short: "Sched",
        perm: "schedule_manage",
      },
      { href: "/admin/hours", label: "Payroll", short: "Hours", perm: "hours" },
      { href: "/admin/team", label: "Team & access", short: "Team", perm: "manage_users" },
    ],
  },
  {
    id: "assets",
    label: "Assets & yard",
    items: [
      { href: "/admin/inventory", label: "Inventory", short: "Stock", perm: "inventory" },
      { href: "/admin/tools", label: "Tools", short: "Tools", perm: "tools" },
      { href: "/admin/fleet", label: "Fleet", short: "Fleet", perm: "fleet" },
      { href: "/admin/fuel", label: "Fuel logs", short: "Fuel", perm: "fuel" },
      { href: "/admin/damage", label: "Damage", short: "Dmg", perm: "damage" },
    ],
  },
  {
    id: "system",
    label: "Administration",
    items: [
      { href: "/admin/users", label: "Users", short: "Users", perm: "users" },
    ],
  },
];

/** Flat list for route guards & legacy lookups */
export const ADMIN_NAV: NavItem[] = ADMIN_NAV_SECTIONS.flatMap((s) => s.items);

/** Sales hub tabs — one place for CRM, automation, support */
export type SalesTab =
  | "pipeline"
  | "clients"
  | "automation"
  | "support"
  | "outreach";

export const SALES_TABS: Array<{
  id: SalesTab;
  label: string;
  perm: Permission;
}> = [
  { id: "pipeline", label: "Pipeline", perm: "leads" },
  { id: "clients", label: "Client 360°", perm: "crm" },
  { id: "automation", label: "Automation", perm: "workflows" },
  { id: "support", label: "Support", perm: "tickets" },
  { id: "outreach", label: "Outreach", perm: "outreach" },
];

/** Legacy URLs → unified destinations (also in next.config redirects) */
export const LEGACY_REDIRECTS: Record<string, string> = {
  "/admin/leads": "/admin/sales?tab=pipeline",
  "/admin/crm": "/admin/sales?tab=clients",
  "/admin/workflows": "/admin/sales?tab=automation",
  "/admin/sequences": "/admin/sales?tab=automation",
  "/admin/tickets": "/admin/sales?tab=support",
  "/admin/outreach": "/admin/sales?tab=outreach",
  "/admin/zones": "/admin/knocker?tab=zones",
};

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/admin/sales") {
    return (
      pathname.startsWith("/admin/sales") ||
      pathname.startsWith("/admin/leads") ||
      pathname.startsWith("/admin/crm") ||
      pathname.startsWith("/admin/workflows") ||
      pathname.startsWith("/admin/sequences") ||
      pathname.startsWith("/admin/tickets") ||
      pathname.startsWith("/admin/outreach")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function navItemForPath(pathname: string): NavItem | undefined {
  return ADMIN_NAV.find((n) => isNavItemActive(pathname, n.href));
}

export function sectionForPath(pathname: string): NavSection | undefined {
  if (isNavItemActive(pathname, "/admin/sales")) {
    return ADMIN_NAV_SECTIONS.find((s) => s.id === "sales");
  }
  return ADMIN_NAV_SECTIONS.find((s) =>
    s.items.some((i) => isNavItemActive(pathname, i.href)),
  );
}
