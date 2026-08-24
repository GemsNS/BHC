import type { AppData } from "./types";
import { openPoolShifts } from "./shifts";
import { formatCurrency, labelize } from "./utils";

export type JarvisContext =
  | "overview"
  | "sales"
  | "workforce"
  | "delivery"
  | "field"
  | "global";

export type JarvisTone = "neutral" | "action" | "success" | "warn";

export type JarvisCategory = "sales" | "field" | "ops" | "ai" | "intel";

export type JarvisAction = {
  label: string;
  href?: string;
  kind?: "primary" | "secondary";
};

export type JarvisInsightDetail = {
  label: string;
  value: string;
};

export type JarvisEntity = {
  label: string;
  meta?: string;
};

export type JarvisInsight = {
  id: string;
  category: JarvisCategory;
  tone: JarvisTone;
  title: string;
  text: string;
  href?: string;
  primaryAction?: JarvisAction;
  secondaryActions?: JarvisAction[];
  details: JarvisInsightDetail[];
  entities?: JarvisEntity[];
  metric?: { value: string; label: string };
  priority: number;
};

export type JarvisMetricChip = {
  id: string;
  label: string;
  value: string;
  tone?: JarvisTone;
  href?: string;
};

export type JarvisSnapshot = {
  context: JarvisContext;
  metrics: JarvisMetricChip[];
  insightCount: number;
};

function countBy<T>(items: T[], fn: (t: T) => boolean): number {
  return items.filter(fn).length;
}

function isToday(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function startOfDay(now = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function employeeName(data: AppData, id: string | null | undefined): string {
  if (!id) return "Unassigned";
  return data.employees.find((e) => e.id === id)?.name ?? id;
}

function pushInsight(
  insights: JarvisInsight[],
  insight: Omit<JarvisInsight, "details"> & { details?: JarvisInsightDetail[] },
) {
  insights.push({
    ...insight,
    details: insight.details ?? [],
  });
}

/** Live metric chips — always visible under the intelligence bar */
export function buildJarvisSnapshot(
  data: AppData,
  context: JarvisContext,
): JarvisSnapshot {
  const now = Date.now();
  const openDeals = data.deals.filter((d) => !d.stage.startsWith("closed"));
  const pipelineValue = openDeals.reduce((sum, d) => sum + d.amount, 0);
  const todayKnocks = data.knocks.filter((k) => isToday(k.createdAt)).length;
  const interestedToday = data.knocks.filter(
    (k) =>
      isToday(k.createdAt) &&
      (k.outcome === "interested" ||
        k.outcome === "appointment" ||
        k.outcome === "pitched"),
  ).length;
  const unread = data.notifications.filter((n) => !n.readAt).length;
  const openPool = openPoolShifts(data.shifts).length;
  const clockedIn = data.timeEntries.filter((t) => !t.clockOut).length;

  const metrics: JarvisMetricChip[] = [];

  if (context === "sales" || context === "overview" || context === "global") {
    metrics.push({
      id: "pipeline",
      label: "Pipeline",
      value: formatCurrency(pipelineValue),
      tone: openDeals.length ? "success" : "neutral",
      href: "/admin/sales?tab=pipeline",
    });
    const newLeads = countBy(data.leads, (l) => l.status === "new");
    if (newLeads > 0) {
      metrics.push({
        id: "new-leads",
        label: "New leads",
        value: String(newLeads),
        tone: "action",
        href: "/admin/sales?tab=pipeline",
      });
    }
  }

  if (context === "field" || context === "overview" || context === "global") {
    metrics.push({
      id: "knocks-today",
      label: "Doors today",
      value: String(todayKnocks),
      tone: todayKnocks > 0 ? "success" : "neutral",
      href: "/apps/knocker",
    });
    if (interestedToday > 0) {
      metrics.push({
        id: "hot-doors",
        label: "Hot doors",
        value: String(interestedToday),
        tone: "action",
        href: "/apps/knocker",
      });
    }
  }

  if (context === "workforce" || context === "overview" || context === "global") {
    if (openPool > 0) {
      metrics.push({
        id: "pool",
        label: "Open shifts",
        value: String(openPool),
        tone: "action",
        href: "/apps/schedule",
      });
    }
    if (clockedIn > 0) {
      metrics.push({
        id: "clocked",
        label: "On clock",
        value: String(clockedIn),
        tone: "neutral",
        href: "/admin/hours",
      });
    }
  }

  if (unread > 0) {
    metrics.push({
      id: "alerts",
      label: "Alerts",
      value: String(unread),
      tone: "warn",
      href: "/admin/dashboard",
    });
  }

  const overdueTodos = data.knockTodos.filter(
    (t) => !t.completedAt && t.dueAt && new Date(t.dueAt).getTime() < now,
  ).length;
  if (overdueTodos > 0 && (context === "field" || context === "global")) {
    metrics.push({
      id: "overdue-tasks",
      label: "Overdue",
      value: String(overdueTodos),
      tone: "warn",
      href: "/apps/knocker",
    });
  }

  return {
    context,
    metrics: metrics.slice(0, 5),
    insightCount: 0,
  };
}

/** Context-aware briefing cards — expand for breakdown + actions */
export function buildJarvisInsights(
  data: AppData,
  context: JarvisContext,
): JarvisInsight[] {
  const insights: JarvisInsight[] = [];
  const now = Date.now();
  const todayStart = startOfDay();

  const newLeads = data.leads.filter((l) => l.status === "new");
  const qualified = data.leads.filter((l) => l.status === "qualified");
  const openDeals = data.deals.filter((d) => !d.stage.startsWith("closed"));
  const pipelineValue = openDeals.reduce((sum, d) => sum + d.amount, 0);
  const pendingOutreach = data.outreachQueue.filter(
    (o) => o.status === "pending_approval",
  );
  const openPool = openPoolShifts(data.shifts);
  const openTickets = data.tickets.filter((t) => t.status !== "closed");
  const urgentTickets = openTickets.filter(
    (t) => t.priority === "urgent" || t.priority === "high",
  );
  const activeJobs = data.jobs.filter(
    (j) => j.status === "in_progress" || j.status === "scheduled",
  );
  const lowStock = data.inventory.filter(
    (i) => i.quantityOnHand <= i.reorderLevel,
  );
  const clockedIn = data.timeEntries.filter((t) => !t.clockOut);

  const todayKnocks = data.knocks.filter((k) => isToday(k.createdAt));
  const interestedKnocks = todayKnocks.filter(
    (k) =>
      k.outcome === "interested" ||
      k.outcome === "appointment" ||
      k.outcome === "pitched" ||
      k.outcome === "sold",
  );
  const openKnockTodos = data.knockTodos.filter((t) => !t.completedAt);
  const overdueKnockTodos = openKnockTodos.filter(
    (t) => t.dueAt && new Date(t.dueAt).getTime() < now,
  );
  const dueSoonKnockTodos = openKnockTodos.filter(
    (t) =>
      t.dueAt &&
      new Date(t.dueAt).getTime() >= now &&
      new Date(t.dueAt).getTime() <= now + 86400000,
  );
  const draftProposals = data.knockProposals.filter(
    (p) => p.status === "draft" || p.status === "presented",
  );
  const unreadNotifications = data.notifications.filter((n) => !n.readAt);
  const activeTurfs = data.knockTerritories.length;
  const activeZones = data.zones.filter((z) => z.status === "active").length;

  const hour = new Date().getHours();
  const automationsDue = data.assistantAutomations.filter(
    (a) =>
      a.enabled &&
      a.runHour <= hour &&
      (!a.lastRunAt || new Date(a.lastRunAt).getTime() < todayStart),
  );

  const dueCrmTasks = data.activities.filter(
    (a) =>
      a.type === "task" &&
      !a.completedAt &&
      a.dueAt &&
      new Date(a.dueAt).getTime() <= now + 86400000,
  );

  const pinnedAnnouncement = data.announcements.find((a) => a.pinned);

  if (context === "sales" || context === "global" || context === "overview") {
    if (newLeads.length > 0) {
      pushInsight(insights, {
        id: "new-leads",
        category: "sales",
        tone: "action",
        title: "New leads",
        text: `${newLeads.length} new lead${newLeads.length > 1 ? "s" : ""} need first contact.`,
        priority: 90,
        metric: { value: String(newLeads.length), label: "Awaiting contact" },
        href: "/admin/sales?tab=pipeline",
        primaryAction: {
          label: "Open pipeline",
          href: "/admin/sales?tab=pipeline",
          kind: "primary",
        },
        secondaryActions: [
          { label: "Ask Mainframe", href: "/admin/assistant", kind: "secondary" },
        ],
        details: [
          { label: "Oldest", value: newLeads[0]?.name ?? "—" },
          {
            label: "Source mix",
            value: `${countBy(newLeads, (l) => l.source === "referral")} referral · ${countBy(newLeads, (l) => l.source === "canvass")} canvass`,
          },
        ],
        entities: newLeads.slice(0, 4).map((l) => ({
          label: l.name,
          meta: `${labelize(l.status)} · ${l.city || "—"}`,
        })),
      });
    }

    if (pendingOutreach.length > 0) {
      pushInsight(insights, {
        id: "outreach",
        category: "sales",
        tone: "warn",
        title: "Outreach queue",
        text: `${pendingOutreach.length} draft${pendingOutreach.length > 1 ? "s" : ""} awaiting your approval before send.`,
        priority: 95,
        metric: { value: String(pendingOutreach.length), label: "Pending" },
        href: "/admin/sales?tab=outreach",
        primaryAction: {
          label: "Review drafts",
          href: "/admin/sales?tab=outreach",
          kind: "primary",
        },
        details: [
          { label: "Queued total", value: String(data.outreachQueue.length) },
          {
            label: "Approved today",
            value: String(
              countBy(
                data.outreachQueue,
                (o) => o.status === "approved" || o.status === "sent",
              ),
            ),
          },
        ],
        entities: pendingOutreach.slice(0, 3).map((o) => ({
          label: o.subject,
          meta: o.prospectEmail,
        })),
      });
    }

    if (openDeals.length > 0) {
      pushInsight(insights, {
        id: "deals",
        category: "sales",
        tone: "success",
        title: "Open pipeline",
        text: `${openDeals.length} deal${openDeals.length > 1 ? "s" : ""} worth ${formatCurrency(pipelineValue)} in active stages.`,
        priority: 70,
        metric: { value: formatCurrency(pipelineValue), label: "Open value" },
        href: "/admin/sales?tab=pipeline",
        primaryAction: {
          label: "View deals",
          href: "/admin/sales?tab=pipeline",
          kind: "primary",
        },
        details: openDeals.slice(0, 4).map((d) => ({
          label: d.title,
          value: `${labelize(d.stage)} · ${formatCurrency(d.amount)}`,
        })),
      });
    }

    if (qualified.length > 0) {
      pushInsight(insights, {
        id: "qualified",
        category: "sales",
        tone: "neutral",
        title: "Qualified leads",
        text: `${qualified.length} qualified — enroll in a sequence or queue outreach.`,
        priority: 60,
        href: "/admin/sales?tab=automation",
        primaryAction: {
          label: "Automation hub",
          href: "/admin/sales?tab=automation",
          kind: "primary",
        },
        entities: qualified.slice(0, 3).map((l) => ({
          label: l.name,
          meta: l.email || l.phone || "—",
        })),
      });
    }
  }

  if (
    context === "field" ||
    context === "global" ||
    context === "overview"
  ) {
    if (overdueKnockTodos.length > 0 || dueSoonKnockTodos.length > 0) {
      const total = overdueKnockTodos.length + dueSoonKnockTodos.length;
      pushInsight(insights, {
        id: "knocker-tasks",
        category: "field",
        tone: overdueKnockTodos.length ? "warn" : "action",
        title: "Field follow-ups",
        text: overdueKnockTodos.length
          ? `${overdueKnockTodos.length} overdue · ${dueSoonKnockTodos.length} due in 24h on the knocker board.`
          : `${dueSoonKnockTodos.length} knocker task${dueSoonKnockTodos.length > 1 ? "s" : ""} due within 24 hours.`,
        priority: overdueKnockTodos.length ? 92 : 75,
        metric: {
          value: String(total),
          label: overdueKnockTodos.length ? "Needs action" : "Due soon",
        },
        href: "/apps/knocker",
        primaryAction: {
          label: "Open knocker",
          href: "/apps/knocker",
          kind: "primary",
        },
        secondaryActions: [
          { label: "Command center", href: "/admin/knocker", kind: "secondary" },
        ],
        details: [
          { label: "Overdue", value: String(overdueKnockTodos.length) },
          { label: "Due ≤24h", value: String(dueSoonKnockTodos.length) },
          { label: "Open total", value: String(openKnockTodos.length) },
        ],
        entities: [...overdueKnockTodos, ...dueSoonKnockTodos]
          .slice(0, 4)
          .map((t) => ({
            label: t.title,
            meta: t.dueAt
              ? new Date(t.dueAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "No due date",
          })),
      });
    }

    if (todayKnocks.length > 0 || activeTurfs > 0) {
      pushInsight(insights, {
        id: "knocks-today",
        category: "field",
        tone: interestedKnocks.length ? "success" : "neutral",
        title: "Today's canvass",
        text:
          todayKnocks.length > 0
            ? `${todayKnocks.length} door${todayKnocks.length > 1 ? "s" : ""} logged · ${interestedKnocks.length} hot outcome${interestedKnocks.length !== 1 ? "s" : ""}.`
            : `${activeTurfs} turf${activeTurfs !== 1 ? "s" : ""} drawn · ${activeZones} active zone${activeZones !== 1 ? "s" : ""} ready for reps.`,
        priority: 65,
        metric: {
          value: String(todayKnocks.length || activeTurfs),
          label: todayKnocks.length ? "Doors today" : "Turfs",
        },
        href: "/apps/knocker",
        primaryAction: {
          label: "Field map",
          href: "/apps/knocker",
          kind: "primary",
        },
        details: [
          { label: "Interested / appt", value: String(interestedKnocks.length) },
          { label: "Active zones", value: String(activeZones) },
          { label: "Team chat", value: `${data.knockChat.length} messages` },
        ],
        entities: interestedKnocks.slice(0, 3).map((k) => ({
          label: k.address,
          meta: labelize(k.outcome),
        })),
      });
    }

    if (draftProposals.length > 0) {
      pushInsight(insights, {
        id: "proposals",
        category: "field",
        tone: "action",
        title: "Open proposals",
        text: `${draftProposals.length} proposal${draftProposals.length > 1 ? "s" : ""} waiting for presentation or signature.`,
        priority: 80,
        href: "/apps/knocker",
        primaryAction: {
          label: "Propose tab",
          href: "/apps/knocker",
          kind: "primary",
        },
        details: draftProposals.slice(0, 3).map((p) => ({
          label: `Pin ${p.pinId}`,
          value: `${labelize(p.status)} · ${formatCurrency(p.total)}`,
        })),
      });
    }
  }

  if (context === "workforce" || context === "global" || context === "overview") {
    if (openPool.length > 0) {
      pushInsight(insights, {
        id: "shifts",
        category: "ops",
        tone: "action",
        title: "Shift pool",
        text: `${openPool.length} open shift${openPool.length > 1 ? "s" : ""} on the pool — crew can claim now.`,
        priority: 85,
        href: "/apps/schedule",
        primaryAction: {
          label: "Claim shifts",
          href: "/apps/schedule",
          kind: "primary",
        },
        secondaryActions: [
          { label: "Schedule grid", href: "/admin/schedule", kind: "secondary" },
        ],
        entities: openPool.slice(0, 3).map((s) => ({
          label: s.title,
          meta: `${new Date(s.startAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${s.location}`,
        })),
      });
    }

    if (clockedIn.length > 0) {
      pushInsight(insights, {
        id: "clocked",
        category: "ops",
        tone: "neutral",
        title: "Crew on clock",
        text: `${clockedIn.length} team member${clockedIn.length > 1 ? "s" : ""} currently clocked in.`,
        priority: 50,
        href: "/admin/hours",
        primaryAction: { label: "Hours board", href: "/admin/hours", kind: "primary" },
        entities: clockedIn.slice(0, 4).map((t) => ({
          label: employeeName(data, t.employeeId),
          meta: t.jobId ? `Job ${t.jobId}` : "No job linked",
        })),
      });
    }
  }

  if (context === "delivery" || context === "global" || context === "overview") {
    if (activeJobs.length > 0) {
      const jobValue = activeJobs.reduce(
        (sum, j) => sum + (j.contractValue || j.estimatedValue),
        0,
      );
      pushInsight(insights, {
        id: "jobs",
        category: "ops",
        tone: "neutral",
        title: "Active jobs",
        text: `${activeJobs.length} job${activeJobs.length > 1 ? "s" : ""} scheduled or in progress (${formatCurrency(jobValue)} booked).`,
        priority: 55,
        href: "/admin/jobs",
        primaryAction: { label: "Job board", href: "/admin/jobs", kind: "primary" },
        details: activeJobs.slice(0, 3).map((j) => ({
          label: j.title,
          value: `${labelize(j.status)} · ${j.customerName}`,
        })),
      });
    }
  }

  if (urgentTickets.length > 0) {
    pushInsight(insights, {
      id: "tickets-urgent",
      category: "sales",
      tone: "warn",
      title: "Priority support",
      text: `${urgentTickets.length} high/urgent ticket${urgentTickets.length > 1 ? "s" : ""} need attention.`,
      priority: 88,
      href: "/admin/sales?tab=support",
      primaryAction: {
        label: "Support queue",
        href: "/admin/sales?tab=support",
        kind: "primary",
      },
      entities: urgentTickets.slice(0, 3).map((t) => ({
        label: t.subject,
        meta: labelize(t.priority),
      })),
    });
  } else if (openTickets.length > 0 && (context === "global" || context === "overview")) {
    pushInsight(insights, {
      id: "tickets",
      category: "sales",
      tone: "warn",
      title: "Support queue",
      text: `${openTickets.length} open ticket${openTickets.length > 1 ? "s" : ""} across clients.`,
      priority: 45,
      href: "/admin/sales?tab=support",
      primaryAction: {
        label: "View tickets",
        href: "/admin/sales?tab=support",
        kind: "primary",
      },
    });
  }

  if (lowStock.length > 0 && (context === "global" || context === "overview" || context === "delivery")) {
    pushInsight(insights, {
      id: "stock",
      category: "ops",
      tone: "warn",
      title: "Inventory alerts",
      text: `${lowStock.length} SKU${lowStock.length > 1 ? "s" : ""} at or below reorder level.`,
      priority: 72,
      href: "/admin/inventory",
      primaryAction: { label: "Inventory", href: "/admin/inventory", kind: "primary" },
      entities: lowStock.slice(0, 4).map((i) => ({
        label: i.name,
        meta: `${i.quantityOnHand} ${i.unit} (reorder ${i.reorderLevel})`,
      })),
    });
  }

  if (dueCrmTasks.length > 0 && (context === "sales" || context === "global")) {
    pushInsight(insights, {
      id: "tasks",
      category: "sales",
      tone: "action",
      title: "CRM follow-ups",
      text: `${dueCrmTasks.length} task${dueCrmTasks.length > 1 ? "s" : ""} due within 24 hours.`,
      priority: 78,
      href: "/admin/sales?tab=clients",
      primaryAction: {
        label: "Client 360°",
        href: "/admin/sales?tab=clients",
        kind: "primary",
      },
      entities: dueCrmTasks.slice(0, 3).map((a) => ({
        label: a.subject,
        meta: a.dueAt
          ? new Date(a.dueAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
            })
          : "—",
      })),
    });
  }

  if (automationsDue.length > 0 && (context === "overview" || context === "global")) {
    pushInsight(insights, {
      id: "automations",
      category: "ai",
      tone: "action",
      title: "Mainframe automations",
      text: `${automationsDue.length} daily automation${automationsDue.length > 1 ? "s" : ""} due to run — pipeline scan, prospect hunt, or outreach digest.`,
      priority: 68,
      href: "/admin/assistant",
      primaryAction: {
        label: "Run from Mainframe",
        href: "/admin/assistant",
        kind: "primary",
      },
      entities: automationsDue.map((a) => ({
        label: a.name,
        meta: a.description.slice(0, 48),
      })),
    });
  }

  if (unreadNotifications.length > 0) {
    pushInsight(insights, {
      id: "notifications",
      category: "ops",
      tone: "warn",
      title: "Unread alerts",
      text: `${unreadNotifications.length} in-app notification${unreadNotifications.length > 1 ? "s" : ""} since your last visit.`,
      priority: 82,
      href: "/admin/dashboard",
      primaryAction: {
        label: "Overview",
        href: "/admin/dashboard",
        kind: "primary",
      },
      entities: unreadNotifications.slice(0, 4).map((n) => ({
        label: n.title,
        meta: n.body.slice(0, 60),
      })),
    });
  }

  if (pinnedAnnouncement && (context === "overview" || context === "global" || context === "field")) {
    pushInsight(insights, {
      id: "announcement",
      category: "ops",
      tone: "neutral",
      title: "Pinned announcement",
      text: pinnedAnnouncement.title,
      priority: 40,
      href: "/admin/board",
      primaryAction: { label: "Team board", href: "/admin/board", kind: "primary" },
      details: [{ label: "Message", value: pinnedAnnouncement.body.slice(0, 120) }],
    });
  }

  if (context === "overview" || context === "global") {
    pushInsight(insights, {
      id: "mainframe",
      category: "ai",
      tone: "action",
      title: "Mainframe AI",
      text: "Natural-language CRM commands — leads, invoices, hunt criteria, daily automations.",
      priority: 35,
      href: "/admin/assistant",
      primaryAction: {
        label: "Open assistant",
        href: "/admin/assistant",
        kind: "primary",
      },
      secondaryActions: [
        { label: "CLI: npm run bhc", kind: "secondary" },
      ],
      details: [
        {
          label: "Profiles",
          value: String(data.assistantProfiles.filter((p) => p.enabled).length),
        },
        {
          label: "Automations",
          value: String(data.assistantAutomations.filter((a) => a.enabled).length),
        },
      ],
    });

    pushInsight(insights, {
      id: "market",
      category: "intel",
      tone: "neutral",
      title: "Market terminal",
      text: "Lumber, mortgage rates, competitor $/sqft, and field weather — refreshes every 30s.",
      priority: 30,
      href: "/admin/markets",
      primaryAction: {
        label: "Open terminal",
        href: "/admin/markets",
        kind: "primary",
      },
    });
  }

  if (!insights.length) {
    pushInsight(insights, {
      id: "clear",
      category: "ops",
      tone: "success",
      title: "All clear",
      text: "All systems nominal. No urgent items in this workspace right now.",
      priority: 10,
      primaryAction: {
        label: "Ops overview",
        href: "/admin/dashboard",
        kind: "primary",
      },
    });
  }

  insights.sort((a, b) => b.priority - a.priority);
  return insights.slice(0, 8);
}

export function jarvisContextFromPath(pathname: string): JarvisContext {
  if (pathname.startsWith("/admin/sales")) return "sales";
  if (
    pathname.startsWith("/admin/schedule") ||
    pathname.startsWith("/admin/hours")
  )
    return "workforce";
  if (
    pathname.startsWith("/admin/jobs") ||
    pathname.startsWith("/admin/progress") ||
    pathname.startsWith("/admin/invoices")
  )
    return "delivery";
  if (
    pathname.startsWith("/apps") ||
    pathname.startsWith("/admin/knocker") ||
    pathname.startsWith("/admin/canvass")
  )
    return "field";
  if (pathname.startsWith("/admin/assistant")) return "overview";
  if (pathname.startsWith("/admin/dashboard")) return "overview";
  return "global";
}

export const JARVIS_CATEGORY_LABELS: Record<JarvisCategory, string> = {
  sales: "Sales",
  field: "Field",
  ops: "Operations",
  ai: "Mainframe",
  intel: "Intel",
};
