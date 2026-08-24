import type { EmployeeRole, Permission } from "./types";
import { ROLE_LABELS, ROLE_PERMISSIONS } from "./types";

export type TutorialCategory =
  | "start"
  | "ops"
  | "sales"
  | "field"
  | "delivery"
  | "workforce"
  | "assets"
  | "ai"
  | "system";

export type TutorialModule = {
  id: string;
  category: TutorialCategory;
  title: string;
  summary: string;
  href: string;
  /** User needs at least one of these permissions to use the feature */
  perms: Permission[];
  /** Roles that should treat this as a primary daily tool */
  focusRoles: EmployeeRole[];
  steps: string[];
  tips?: string[];
};

export type RoleWalkthrough = {
  role: EmployeeRole;
  blurb: string;
  demo?: { login: string; pin: string };
  /** Ordered module ids for “start here” */
  path: string[];
};

export const TUTORIAL_CATEGORY_LABELS: Record<TutorialCategory, string> = {
  start: "Getting started",
  ops: "Command center",
  sales: "Sales & clients",
  field: "Field & knocker",
  delivery: "Jobs & delivery",
  workforce: "Workforce",
  assets: "Assets & yard",
  ai: "AI & intelligence",
  system: "Administration",
};

export const ROLE_WALKTHROUGHS: RoleWalkthrough[] = [
  {
    role: "admin",
    blurb: "Full access — configure users, run Mainframe, and oversee every module.",
    demo: { login: "cameron", pin: "1001" },
    path: [
      "login",
      "command-deck",
      "jarvis",
      "sales-hub",
      "knocker-command",
      "mainframe",
      "users",
    ],
  },
  {
    role: "manager",
    blurb: "Ops oversight without user administration — pipeline, crew, jobs, and inventory.",
    demo: { login: "taylor", pin: "1006" },
    path: [
      "login",
      "command-deck",
      "sales-hub",
      "schedule-admin",
      "jobs",
      "inventory",
      "board",
    ],
  },
  {
    role: "sales",
    blurb: "Own the funnel — leads, Client 360°, outreach approval, and canvass handoff.",
    demo: { login: "alex", pin: "1002" },
    path: [
      "login",
      "sales-hub",
      "outreach",
      "canvass",
      "knocker-field",
      "invoices",
      "board",
    ],
  },
  {
    role: "knocker",
    blurb: "Door-to-door day: map, turf, pins, routes, proposals, and shift pool.",
    demo: { login: "jamie", pin: "1007" },
    path: [
      "login",
      "apps-hub",
      "knocker-field",
      "zones",
      "schedule-field",
      "clock",
      "board",
    ],
  },
  {
    role: "field",
    blurb: "Crew tools — clock, job progress photos, tools, damage, and schedule claims.",
    demo: { login: "sam", pin: "1003" },
    path: [
      "login",
      "apps-hub",
      "clock",
      "progress",
      "tools",
      "damage",
      "schedule-field",
      "jobs",
    ],
  },
  {
    role: "office",
    blurb: "Desk ops — CRM support, invoices, inventory, materials, and team roster.",
    path: [
      "login",
      "command-deck",
      "sales-hub",
      "support",
      "invoices",
      "inventory",
      "materials",
      "hours",
    ],
  },
  {
    role: "driver",
    blurb: "Fleet and fuel first — log fills, check tools, claim shifts, read the board.",
    demo: { login: "riley", pin: "1005" },
    path: [
      "login",
      "apps-hub",
      "fleet",
      "fuel",
      "tools",
      "schedule-field",
      "clock",
      "board",
    ],
  },
];

export const TUTORIAL_MODULES: TutorialModule[] = [
  {
    id: "login",
    category: "start",
    title: "Staff login",
    summary: "Every employee signs in with a login name + PIN. Session stays in the browser until you sign out.",
    href: "/login",
    perms: ["board"],
    focusRoles: ["admin", "manager", "sales", "knocker", "field", "office", "driver"],
    steps: [
      "Open /login (or Staff login on the public site).",
      "Enter your login and PIN — demo chips show cameron, jamie, sam, riley.",
      "You land on your role home: Command deck (admin/manager/sales/office) or Field apps (knocker/field/driver).",
      "Use Sign out in the top bar when finished on a shared device.",
    ],
    tips: [
      "Optional ?next=/path redirects after login.",
      "Permissions gate every nav item — if you cannot see a page, your role lacks that permission.",
    ],
  },
  {
    id: "apps-hub",
    category: "start",
    title: "Field apps hub",
    summary: "Mobile-first home for field roles — only tools your role can use appear.",
    href: "/apps",
    perms: ["apps"],
    focusRoles: ["knocker", "field", "driver", "sales"],
    steps: [
      "Open /apps after login (or Field from the admin top bar).",
      "Scan Today metrics (knocks, zones, jobs) for your user.",
      "Tap a card to jump into schedule, knocker, clock, tools, damage, or progress.",
      "Bottom tabs keep the same field apps one thumb away.",
    ],
  },
  {
    id: "shell-nav",
    category: "start",
    title: "Shell, rail & command palette",
    summary: "How to move around: collapsible rail, mobile chips, ⌘K search, and JARVIS.",
    href: "/admin/dashboard",
    perms: ["board"],
    focusRoles: ["admin", "manager", "sales", "office"],
    steps: [
      "Desktop: use the left rail. Collapse it with the chevron for icon-only mode.",
      "Accordion sections open/close; preference is saved in localStorage.",
      "Mobile: horizontal chips under the top bar + bottom field tabs in apps mode.",
      "Press ⌘K / Ctrl+K to open the command palette and jump to any allowed page.",
    ],
    tips: ["JARVIS sits under the top bar on most screens — expand a briefing for actions."],
  },
  {
    id: "command-deck",
    category: "ops",
    title: "HUD command deck",
    summary: "Immersive neon overview — SALES / INSTALL / ADMIN / NET / MKT with live pipeline nodes.",
    href: "/admin/dashboard",
    perms: ["dashboard"],
    focusRoles: ["admin", "manager", "sales", "office"],
    steps: [
      "Open /admin/dashboard (default home for desk roles).",
      "Use the radial dock to switch SALES, INSTALL, ADMIN, NET, MKT views.",
      "Click PIPELINE / NEW / QUALIFIED nodes to expand matching JARVIS briefings.",
      "Click metric chips (pipeline $, new leads, open shifts) for the same detail panel.",
      "Use Classic view (?classic=1) for the list-based ops wall with alerts + activity feed.",
    ],
  },
  {
    id: "jarvis",
    category: "ai",
    title: "JARVIS intelligence bar",
    summary: "Live metric chips + expandable briefings wired to CRM, knocker, shifts, and alerts.",
    href: "/admin/sales",
    perms: ["board"],
    focusRoles: ["admin", "manager", "sales", "office"],
    steps: [
      "Look under the top bar (or above the HUD dock on the command deck).",
      "Scan chips: pipeline value, new leads, doors today, open shifts, alerts.",
      "Click the briefing text or a dot to expand breakdown rows and entities.",
      "Use primary actions (Open pipeline, Field map, Claim shifts) to jump in.",
      "Hover pauses rotation; Collapse returns to the compact strip.",
    ],
  },
  {
    id: "markets",
    category: "ops",
    title: "Market terminal",
    summary: "Bloomberg-style ticker — lumber, mortgage, competitor $/sqft, field weather.",
    href: "/admin/markets",
    perms: ["stats"],
    focusRoles: ["admin", "manager", "sales"],
    steps: [
      "Open /admin/markets (immersive terminal chrome).",
      "Watch the ticker and watchlist chips — auto-refresh every 30s.",
      "Read decision signals and Open-Meteo weather for field planning.",
      "Use competitor $/sqft grid when pricing estimates.",
    ],
  },
  {
    id: "stats",
    category: "ops",
    title: "Analytics",
    summary: "Historical projections and performance rollups for leadership.",
    href: "/admin/stats",
    perms: ["stats"],
    focusRoles: ["admin", "manager"],
    steps: [
      "Open /admin/stats.",
      "Review projected revenue, jobs, and knocks by month.",
      "Cross-check with command deck KPIs after big canvass weeks.",
    ],
  },
  {
    id: "board",
    category: "ops",
    title: "Announcements board",
    summary: "Company messages — optionally targeted to roles. Available in admin and field.",
    href: "/admin/board",
    perms: ["board"],
    focusRoles: ["admin", "manager", "office", "knocker", "field", "driver"],
    steps: [
      "Open /admin/board or /apps/board.",
      "Read pinned posts first (safety stand-downs, turf priorities).",
      "Roles with board_post can author announcements and set audience roles.",
      "Field crews should check the board at start of shift.",
    ],
  },
  {
    id: "sales-hub",
    category: "sales",
    title: "Sales hub (Pipeline)",
    summary: "Unified CRM: Pipeline, Client 360°, Automation, Support, Outreach tabs.",
    href: "/admin/sales?tab=pipeline",
    perms: ["leads", "crm"],
    focusRoles: ["admin", "manager", "sales", "office"],
    steps: [
      "Open /admin/sales.",
      "Pipeline tab: scan open deals, add leads, update stages.",
      "Client 360°: pick a contact/company and review activity timeline.",
      "Automation: enable workflows and sequences (lead created → task/outreach).",
      "Legacy URLs (/admin/leads, /crm, …) redirect here automatically.",
    ],
  },
  {
    id: "outreach",
    category: "sales",
    title: "Outreach approval queue",
    summary: "AI/Mainframe drafts stay pending_approval until a human sends — never auto-email.",
    href: "/admin/sales?tab=outreach",
    perms: ["outreach"],
    focusRoles: ["admin", "manager", "sales"],
    steps: [
      "Open Sales → Outreach.",
      "Review subject, body, and recipient for each pending draft.",
      "Approve only after editing tone/facts; cancel junk drafts.",
      "Wire GoDaddy/SMTP later — until then, treat approve as ready-to-send staging.",
    ],
    tips: ["JARVIS warns when drafts await approval."],
  },
  {
    id: "support",
    category: "sales",
    title: "Support tickets",
    summary: "Client issues with priority — urgent tickets surface in JARVIS.",
    href: "/admin/sales?tab=support",
    perms: ["tickets"],
    focusRoles: ["admin", "manager", "office"],
    steps: [
      "Open Sales → Support.",
      "Triage new/open tickets by priority.",
      "Assign an owner and link to a lead/company when possible.",
      "Close with a short resolution note.",
    ],
  },
  {
    id: "canvass",
    category: "sales",
    title: "Classic canvassing log",
    summary: "Log door outcomes and convert appointments into leads.",
    href: "/admin/canvass",
    perms: ["canvass"],
    focusRoles: ["admin", "manager", "sales"],
    steps: [
      "Open /admin/canvass.",
      "Log address, outcome (interested, appointment, not home…), and notes.",
      "Convert appointments straight into the lead pipeline.",
      "Prefer Active Knocker map for GPS-heavy days; keep this for quick desk logging.",
    ],
  },
  {
    id: "zones",
    category: "field",
    title: "Territories & zones",
    summary: "Neighborhood targets assigned to knockers with door goals.",
    href: "/admin/zones",
    perms: ["zones"],
    focusRoles: ["admin", "manager", "sales", "knocker"],
    steps: [
      "Open /admin/zones.",
      "Create or edit zones (neighborhood, city, target doors).",
      "Assign knocker IDs and set status (open / active / completed).",
      "Field reps see assigned zones inside Active Knocker.",
    ],
  },
  {
    id: "knocker-command",
    category: "field",
    title: "Active Knocker (command)",
    summary: "Ops view of turfs, pins, GPS, routes, tasks, proposals, and team chat.",
    href: "/admin/knocker",
    perms: ["zones"],
    focusRoles: ["admin", "manager", "sales"],
    steps: [
      "Open /admin/knocker.",
      "Map tab: review turfs, pin clusters, and rep breadcrumbs.",
      "Draw turf (≥3 points) → Close polygon → assign reps.",
      "Monitor Tasks, Propose, Team, and Stats tabs for the whole crew.",
      "Configure webhooks under integrations when pushing events to an external CRM.",
    ],
  },
  {
    id: "knocker-field",
    category: "field",
    title: "Active Knocker (field day)",
    summary: "Phone-first door flow: GPS, pins, route handoff, calendar, signatures, push.",
    href: "/apps/knocker",
    perms: ["knocker"],
    focusRoles: ["knocker", "sales", "admin"],
    steps: [
      "Open /apps/knocker and allow location.",
      "Map: pick zone → Draw turf or drop a pin at the door.",
      "Pin tab: address, tags, outcome, optional CRM lead; use allow-duplicate only for intentional double-knocks.",
      "Route: optimize stops → open Google / Apple / Waze.",
      "Tasks: set due datetime → Google Calendar or .ics; Enable push for reminders.",
      "Propose: pick products/services → Build → sign canvas → Capture sign-off.",
      "Team: leaderboard + chat. Stats: conversion + GPS distance filter / accuracy / wake lock.",
    ],
  },
  {
    id: "jobs",
    category: "delivery",
    title: "Active jobs",
    summary: "Scheduled and in-progress installs with contract values and crew leads.",
    href: "/admin/jobs",
    perms: ["jobs"],
    focusRoles: ["admin", "manager", "field", "office"],
    steps: [
      "Open /admin/jobs.",
      "Filter by status (scheduled, in progress, on hold, completed).",
      "Open a job for address, customer, notes, and linked lead.",
      "Move status forward as the crew completes milestones.",
    ],
  },
  {
    id: "progress",
    category: "delivery",
    title: "Site updates & progress photos",
    summary: "Photos + notes on the job; optional AI summarize for reports.",
    href: "/apps/progress",
    perms: ["progress"],
    focusRoles: ["field", "admin", "manager", "office"],
    steps: [
      "Open /apps/progress or /admin/progress.",
      "Select the job and add notes.",
      "Attach compressed photos from the phone camera.",
      "Run AI summarize when building a full job report / invoice package.",
    ],
  },
  {
    id: "invoices",
    category: "delivery",
    title: "Billing & job reports",
    summary: "Draft invoices or full reports with progress entries and line items.",
    href: "/admin/invoices",
    perms: ["invoices"],
    focusRoles: ["admin", "manager", "sales", "office"],
    steps: [
      "Open /admin/invoices.",
      "Choose invoice vs full report; attach progress entry IDs when needed.",
      "Add line items (labor, materials deposit).",
      "Mark sent/paid as the customer cycle completes.",
    ],
  },
  {
    id: "materials",
    category: "delivery",
    title: "Job materials",
    summary: "Vendor costs tied to jobs for margin tracking.",
    href: "/admin/materials",
    perms: ["materials"],
    focusRoles: ["admin", "manager", "office"],
    steps: [
      "Open /admin/materials.",
      "Log description, vendor, quantity, unit cost against a job.",
      "Use alongside inventory issues for accurate job cost.",
    ],
  },
  {
    id: "schedule-admin",
    category: "workforce",
    title: "Team schedule (admin)",
    summary: "Week grid — publish shifts, mark overtime, post to the open pool.",
    href: "/admin/schedule",
    perms: ["schedule_manage"],
    focusRoles: ["admin", "manager"],
    steps: [
      "Open /admin/schedule.",
      "Build the week grid by employee or role need.",
      "Post unfilled slots to the open pool for crew claims.",
      "Flag overtime shifts clearly so payroll sees them.",
    ],
  },
  {
    id: "schedule-field",
    category: "workforce",
    title: "Shift pool (field)",
    summary: "Claim open and overtime shifts from your phone.",
    href: "/apps/schedule",
    perms: ["schedule", "shift_pool"],
    focusRoles: ["knocker", "field", "driver", "sales"],
    steps: [
      "Open /apps/schedule.",
      "Review your assigned shifts.",
      "Claim available open-pool or overtime slots.",
      "JARVIS surfaces open shifts as an action briefing.",
    ],
  },
  {
    id: "hours",
    category: "workforce",
    title: "Payroll / hours",
    summary: "Time entries for crew — who is clocked in and total hours.",
    href: "/admin/hours",
    perms: ["hours"],
    focusRoles: ["admin", "manager", "office", "field"],
    steps: [
      "Open /admin/hours.",
      "See live clocked-in crew and historical entries.",
      "Cross-check against schedule claims before payroll export.",
    ],
  },
  {
    id: "clock",
    category: "workforce",
    title: "Time clock",
    summary: "Clock in/out against jobs from any phone.",
    href: "/apps/clock",
    perms: ["clock"],
    focusRoles: ["field", "knocker", "driver", "sales"],
    steps: [
      "Open /apps/clock (or /portal).",
      "Clock in — optionally link a job.",
      "Clock out at end of shift; add notes if needed.",
      "Managers review the same entries under Payroll.",
    ],
  },
  {
    id: "team",
    category: "workforce",
    title: "Team roster",
    summary: "Who is on the crew — roles and contact context for managers.",
    href: "/admin/team",
    perms: ["team"],
    focusRoles: ["admin", "manager", "office"],
    steps: [
      "Open /admin/team.",
      "Scan roles and active employees.",
      "Use Users admin to change logins/PINs (admin only).",
    ],
  },
  {
    id: "inventory",
    category: "assets",
    title: "Inventory",
    summary: "SKU stock, reorder levels, receive/issue/adjust transactions.",
    href: "/admin/inventory",
    perms: ["inventory"],
    focusRoles: ["admin", "manager", "office"],
    steps: [
      "Open /admin/inventory.",
      "Watch reorder warnings (also in JARVIS).",
      "Receive stock or issue materials to a job.",
      "Adjust counts after physical yard counts.",
    ],
  },
  {
    id: "tools",
    category: "assets",
    title: "Tools check-in/out",
    summary: "Yard assets assigned to people and jobs.",
    href: "/apps/tools",
    perms: ["tools"],
    focusRoles: ["field", "driver", "admin", "office"],
    steps: [
      "Open /apps/tools or /admin/tools.",
      "Check out a tool to yourself (and optionally a job).",
      "Check in when returned to the yard.",
      "Mark damaged tools and file a damage report.",
    ],
  },
  {
    id: "fleet",
    category: "assets",
    title: "Fleet",
    summary: "Vehicle status, plates, drivers, and last GPS-ish update.",
    href: "/admin/fleet",
    perms: ["fleet"],
    focusRoles: ["admin", "manager", "driver"],
    steps: [
      "Open /admin/fleet.",
      "Confirm each vehicle’s driver and status (active / idle / maintenance).",
      "Drivers should keep assignments accurate before rolling out.",
    ],
  },
  {
    id: "fuel",
    category: "assets",
    title: "Fuel logs",
    summary: "Same-day fill logging with odometer and cost.",
    href: "/admin/fuel",
    perms: ["fuel"],
    focusRoles: ["driver", "admin", "manager"],
    steps: [
      "Open /admin/fuel (also linked from Field apps).",
      "Log gallons, cost, odometer, station after every fill.",
      "Managers review spend on the ops wall.",
    ],
  },
  {
    id: "damage",
    category: "assets",
    title: "Damage reports",
    summary: "Tool, vehicle, material, or site damage with photos.",
    href: "/apps/damage",
    perms: ["damage"],
    focusRoles: ["field", "driver", "admin", "office"],
    steps: [
      "Open /apps/damage or /admin/damage.",
      "Pick target type, severity, and description.",
      "Attach photos; link a job when relevant.",
      "Resolve after repair/replacement.",
    ],
  },
  {
    id: "mainframe",
    category: "ai",
    title: "Mainframe AI assistant",
    summary: "Natural-language CRM commands — leads, invoices, hunt criteria, daily automations.",
    href: "/admin/assistant",
    perms: ["dashboard"],
    focusRoles: ["admin", "manager"],
    steps: [
      "Open /admin/assistant or the floating MAINFRAME button.",
      "Ask for pipeline summaries, create leads, or run daily automations.",
      "Check the provider badge (Gemini / OpenAI / local).",
      "On GitHub Pages demos only: paste a browser Gemini key in the sidebar for testing — never commit keys.",
      "CLI: npm run bhc -- ai chat \"CRM summary\".",
    ],
    tips: ["Outreach from Mainframe always lands in pending_approval."],
  },
  {
    id: "users",
    category: "system",
    title: "Users & roles",
    summary: "Create employees, set login/PIN, and assign roles that drive permissions.",
    href: "/admin/users",
    perms: ["users"],
    focusRoles: ["admin"],
    steps: [
      "Open /admin/users (admin only).",
      "Add or edit an employee: name, login, PIN, role.",
      "Role maps to permissions — changing role immediately changes what they can open.",
      "Managers cannot manage users; escalate role changes to admin.",
    ],
  },
];

export function roleHasModuleAccess(
  role: EmployeeRole,
  module: TutorialModule,
): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return module.perms.some((p) => perms.includes(p));
}

export function modulesForRole(role: EmployeeRole): TutorialModule[] {
  return TUTORIAL_MODULES.filter((m) => roleHasModuleAccess(role, m));
}

export function walkthroughForRole(role: EmployeeRole): RoleWalkthrough {
  return (
    ROLE_WALKTHROUGHS.find((w) => w.role === role) ?? ROLE_WALKTHROUGHS[0]
  );
}

export function orderedPathModules(role: EmployeeRole): TutorialModule[] {
  const walk = walkthroughForRole(role);
  const byId = Object.fromEntries(TUTORIAL_MODULES.map((m) => [m.id, m]));
  return walk.path
    .map((id) => byId[id])
    .filter((m): m is TutorialModule => Boolean(m) && roleHasModuleAccess(role, m));
}

export function modulesByCategory(
  modules: TutorialModule[],
): Array<{ category: TutorialCategory; label: string; items: TutorialModule[] }> {
  const order: TutorialCategory[] = [
    "start",
    "ops",
    "sales",
    "field",
    "delivery",
    "workforce",
    "assets",
    "ai",
    "system",
  ];
  return order
    .map((category) => ({
      category,
      label: TUTORIAL_CATEGORY_LABELS[category],
      items: modules.filter((m) => m.category === category),
    }))
    .filter((g) => g.items.length > 0);
}

export function allRoles(): EmployeeRole[] {
  return Object.keys(ROLE_LABELS) as EmployeeRole[];
}
