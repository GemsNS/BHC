import type { AppData } from "./types";
import { openPoolShifts } from "./shifts";

export type JarvisInsight = {
  id: string;
  tone: "neutral" | "action" | "success" | "warn";
  text: string;
  href?: string;
};

function countBy<T>(items: T[], fn: (t: T) => boolean): number {
  return items.filter(fn).length;
}

/** Context-aware briefing lines — shown across the shell, not one page */
export function buildJarvisInsights(
  data: AppData,
  context: "overview" | "sales" | "workforce" | "delivery" | "field" | "global",
): JarvisInsight[] {
  const insights: JarvisInsight[] = [];
  const now = Date.now();

  const newLeads = countBy(data.leads, (l) => l.status === "new");
  const qualified = countBy(data.leads, (l) => l.status === "qualified");
  const openDeals = data.deals.filter((d) => !d.stage.startsWith("closed")).length;
  const pendingOutreach = data.outreachQueue.filter(
    (o) => o.status === "pending_approval",
  ).length;
  const openPool = openPoolShifts(data.shifts).length;
  const openTickets = data.tickets.filter((t) => t.status !== "closed").length;
  const activeJobs = countBy(
    data.jobs,
    (j) => j.status === "in_progress" || j.status === "scheduled",
  );
  const lowStock = data.inventory.filter(
    (i) => i.quantityOnHand <= i.reorderLevel,
  ).length;
  const clockedIn = data.timeEntries.filter((t) => !t.clockOut).length;

  if (context === "sales" || context === "global" || context === "overview") {
    if (newLeads > 0) {
      insights.push({
        id: "new-leads",
        tone: "action",
        text: `${newLeads} new lead${newLeads > 1 ? "s" : ""} need first contact.`,
        href: "/admin/sales?tab=pipeline",
      });
    }
    if (qualified > 0) {
      insights.push({
        id: "qualified",
        tone: "neutral",
        text: `${qualified} qualified lead${qualified > 1 ? "s" : ""} — automation can queue outreach.`,
        href: "/admin/sales?tab=automation",
      });
    }
    if (pendingOutreach > 0) {
      insights.push({
        id: "outreach",
        tone: "warn",
        text: `${pendingOutreach} outreach draft${pendingOutreach > 1 ? "s" : ""} awaiting approval.`,
        href: "/admin/sales?tab=outreach",
      });
    }
    if (openDeals > 0) {
      insights.push({
        id: "deals",
        tone: "success",
        text: `${openDeals} open deal${openDeals > 1 ? "s" : ""} in pipeline.`,
        href: "/admin/sales?tab=pipeline",
      });
    }
  }

  if (context === "workforce" || context === "global" || context === "overview") {
    if (openPool > 0) {
      insights.push({
        id: "shifts",
        tone: "action",
        text: `${openPool} open shift${openPool > 1 ? "s" : ""} on the pool — crew can claim now.`,
        href: "/apps/schedule",
      });
    }
    if (clockedIn > 0) {
      insights.push({
        id: "clocked",
        tone: "neutral",
        text: `${clockedIn} crew member${clockedIn > 1 ? "s" : ""} clocked in.`,
        href: "/admin/hours",
      });
    }
  }

  if (context === "delivery" || context === "global" || context === "overview") {
    if (activeJobs > 0) {
      insights.push({
        id: "jobs",
        tone: "neutral",
        text: `${activeJobs} job${activeJobs > 1 ? "s" : ""} active or scheduled.`,
        href: "/admin/jobs",
      });
    }
  }

  if (context === "global" || context === "overview") {
    if (openTickets > 0) {
      insights.push({
        id: "tickets",
        tone: "warn",
        text: `${openTickets} support ticket${openTickets > 1 ? "s" : ""} open.`,
        href: "/admin/sales?tab=support",
      });
    }
    if (lowStock > 0) {
      insights.push({
        id: "stock",
        tone: "warn",
        text: `${lowStock} inventory item${lowStock > 1 ? "s" : ""} at or below reorder.`,
        href: "/admin/inventory",
      });
    }
  }

  const dueTasks = data.activities.filter(
    (a) =>
      a.type === "task" &&
      !a.completedAt &&
      a.dueAt &&
      new Date(a.dueAt).getTime() <= now + 86400000,
  ).length;
  if (dueTasks > 0 && (context === "sales" || context === "global")) {
    insights.push({
      id: "tasks",
      tone: "action",
      text: `${dueTasks} follow-up task${dueTasks > 1 ? "s" : ""} due within 24 hours.`,
      href: "/admin/sales?tab=clients",
    });
  }

  if (!insights.length) {
    insights.push({
      id: "clear",
      tone: "success",
      text: "All systems nominal. GoDaddy email can plug in when you're ready.",
    });
  }

  return insights.slice(0, 4);
}

export function jarvisContextFromPath(pathname: string): Parameters<
  typeof buildJarvisInsights
>[1] {
  if (pathname.startsWith("/admin/sales")) return "sales";
  if (pathname.startsWith("/admin/schedule") || pathname.startsWith("/admin/hours"))
    return "workforce";
  if (
    pathname.startsWith("/admin/jobs") ||
    pathname.startsWith("/admin/progress") ||
    pathname.startsWith("/admin/invoices")
  )
    return "delivery";
  if (pathname.startsWith("/apps")) return "field";
  if (pathname.startsWith("/admin/dashboard")) return "overview";
  return "global";
}
