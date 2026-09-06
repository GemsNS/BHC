import { enqueueNotification } from "./notifications";
import type { AppData, CrmActivity, InAppNotification } from "./types";

/**
 * Pure ops checks run by the automation engine. Every check is idempotent:
 * it uses `dedupeKey` on notifications and open-task lookups so repeated
 * ticks never spam the team.
 */

export type CheckContext = {
  newId: () => string;
  nowIso: () => string;
  now?: number;
};

export type CheckResult = {
  summary: string;
  notifications: number;
  tasks: number;
};

const DAY = 86_400_000;
const HOUR = 3_600_000;

function envInt(name: string, fallback: number): number {
  if (typeof process === "undefined") return fallback;
  const raw = process.env?.[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const AUTOMATION_THRESHOLDS = {
  invoiceDueDays: () => envInt("AUTOMATION_INVOICE_DUE_DAYS", 30),
  invoiceDraftStaleDays: () => envInt("AUTOMATION_INVOICE_DRAFT_DAYS", 3),
  jobSilentDays: () => envInt("AUTOMATION_JOB_SILENT_DAYS", 5),
  toolCheckoutMaxDays: () => envInt("AUTOMATION_TOOL_MAX_DAYS", 7),
  damageEscalateHours: () => envInt("AUTOMATION_DAMAGE_ESCALATE_HOURS", 24),
  fleetStaleDays: () => envInt("AUTOMATION_FLEET_STALE_DAYS", 3),
};

/** Local calendar day (matches job.startDate, which is entered as a local date) */
function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Has a notification with this dedupe key been created within `windowMs`? */
export function notifiedRecently(
  data: AppData,
  dedupeKey: string,
  windowMs: number,
  now: number,
): boolean {
  return data.notifications.some(
    (n) =>
      n.dedupeKey === dedupeKey &&
      now - new Date(n.createdAt).getTime() < windowMs,
  );
}

export function notifyOnce(
  data: AppData,
  ctx: CheckContext,
  note: Omit<InAppNotification, "id" | "createdAt" | "readAt" | "dedupeKey"> & {
    dedupeKey: string;
  },
  windowMs = DAY,
): boolean {
  const now = ctx.now ?? Date.now();
  if (notifiedRecently(data, note.dedupeKey, windowMs, now)) return false;
  enqueueNotification(data, note, ctx.newId, ctx.nowIso);
  return true;
}

/** Is there an open task for this record whose subject starts with `prefix`? */
export function hasOpenTask(data: AppData, relatedId: string, prefix: string): boolean {
  return data.activities.some(
    (a) =>
      a.type === "task" &&
      !a.completedAt &&
      a.relatedId === relatedId &&
      a.subject.startsWith(prefix),
  );
}

export function createTaskOnce(
  data: AppData,
  ctx: CheckContext,
  task: {
    subject: string;
    body: string;
    relatedType: CrmActivity["relatedType"];
    relatedId: string;
    authorId: string;
    dueAt: string | null;
  },
): boolean {
  if (hasOpenTask(data, task.relatedId, task.subject)) return false;
  data.activities.unshift({
    id: ctx.newId(),
    type: "task",
    subject: task.subject,
    body: task.body,
    relatedType: task.relatedType,
    relatedId: task.relatedId,
    authorId: task.authorId,
    dueAt: task.dueAt,
    completedAt: null,
    createdAt: ctx.nowIso(),
  });
  return true;
}

function managerIds(data: AppData): string[] {
  return data.employees
    .filter((e) => e.active && (e.role === "admin" || e.role === "manager" || e.role === "office"))
    .map((e) => e.id);
}

function employeeLabel(data: AppData, id: string | null): string {
  if (!id) return "unassigned";
  return data.employees.find((e) => e.id === id)?.name ?? id;
}

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

export function checkTaskReminders(data: AppData, ctx: CheckContext): CheckResult {
  const now = ctx.now ?? Date.now();
  let notifications = 0;

  // Knocker to-dos due within 15 minutes or overdue
  for (const todo of data.knockTodos) {
    if (todo.completedAt || !todo.dueAt || todo.reminderSentAt) continue;
    const due = new Date(todo.dueAt).getTime();
    if (due > now + 15 * 60_000) continue;
    enqueueNotification(
      data,
      {
        employeeId: todo.assignedToId,
        title: due < now ? "Overdue knocker task" : "Knocker task due soon",
        body: todo.title,
        href: "/apps/knocker",
        dedupeKey: `todo:${todo.id}`,
      },
      ctx.newId,
      ctx.nowIso,
    );
    todo.reminderSentAt = ctx.nowIso();
    notifications += 1;
  }

  // CRM tasks overdue (once per day per task)
  for (const act of data.activities) {
    if (act.type !== "task" || act.completedAt || !act.dueAt) continue;
    if (new Date(act.dueAt).getTime() > now) continue;
    const created = notifyOnce(data, ctx, {
      employeeId: act.authorId,
      title: "Overdue task",
      body: act.subject,
      href: "/admin/sales?tab=clients",
      dedupeKey: `task-overdue:${act.id}`,
    });
    if (created) notifications += 1;
  }

  return {
    summary: `Task reminders: ${notifications} reminder(s) sent.`,
    notifications,
    tasks: 0,
  };
}

export function checkInvoices(data: AppData, ctx: CheckContext): CheckResult {
  const now = ctx.now ?? Date.now();
  const dueMs = AUTOMATION_THRESHOLDS.invoiceDueDays() * DAY;
  const draftMs = AUTOMATION_THRESHOLDS.invoiceDraftStaleDays() * DAY;
  let notifications = 0;
  let tasks = 0;

  for (const inv of data.invoices) {
    if (inv.kind !== "invoice") continue;
    const age = now - new Date(inv.createdAt).getTime();
    if (inv.status === "sent" && age > dueMs) {
      const days = Math.floor(age / DAY);
      if (
        createTaskOnce(data, ctx, {
          subject: `Collect payment: ${inv.customerName}`,
          body: `Invoice ${inv.id.slice(0, 8)} sent ${days} days ago and still unpaid.`,
          relatedType: "job",
          relatedId: inv.jobId,
          authorId: inv.createdById,
          dueAt: ctx.nowIso(),
        })
      ) {
        tasks += 1;
      }
      if (
        notifyOnce(
          data,
          ctx,
          {
            employeeId: null,
            title: "Invoice overdue",
            body: `${inv.customerName} — sent ${days} days ago, unpaid.`,
            href: "/admin/invoices",
            dedupeKey: `invoice-overdue:${inv.id}`,
          },
          7 * DAY,
        )
      ) {
        notifications += 1;
      }
    } else if (inv.status === "draft" && age > draftMs) {
      if (
        notifyOnce(
          data,
          ctx,
          {
            employeeId: inv.createdById,
            title: "Draft invoice never sent",
            body: `${inv.customerName} — drafted ${Math.floor(age / DAY)} days ago.`,
            href: "/admin/invoices",
            dedupeKey: `invoice-draft:${inv.id}`,
          },
          3 * DAY,
        )
      ) {
        notifications += 1;
      }
    }
  }

  return {
    summary: `Invoice follow-up: ${tasks} collection task(s), ${notifications} alert(s).`,
    notifications,
    tasks,
  };
}

export function checkJobHealth(data: AppData, ctx: CheckContext): CheckResult {
  const now = ctx.now ?? Date.now();
  const silentMs = AUTOMATION_THRESHOLDS.jobSilentDays() * DAY;
  let notifications = 0;
  let tasks = 0;
  const todayKey = dayKey(now);

  for (const job of data.jobs) {
    if (job.status === "in_progress") {
      const latest = data.jobProgress
        .filter((p) => p.jobId === job.id)
        .map((p) => new Date(p.createdAt).getTime())
        .sort((a, b) => b - a)[0];
      const since = latest ?? new Date(job.createdAt).getTime();
      if (now - since > silentMs) {
        if (
          notifyOnce(
            data,
            ctx,
            {
              employeeId: job.crewLeadId,
              title: "Job needs a site update",
              body: `${job.title} — no progress posted for ${Math.floor((now - since) / DAY)} days.`,
              href: "/admin/progress",
              dedupeKey: `job-silent:${job.id}`,
            },
            2 * DAY,
          )
        ) {
          notifications += 1;
        }
      }
    }

    if (job.status === "completed") {
      const hasInvoice = data.invoices.some(
        (i) => i.jobId === job.id && i.kind === "invoice",
      );
      if (
        !hasInvoice &&
        createTaskOnce(data, ctx, {
          subject: `Create invoice: ${job.title}`,
          body: `Job completed for ${job.customerName} but no invoice exists yet.`,
          relatedType: "job",
          relatedId: job.id,
          authorId: job.crewLeadId ?? managerIds(data)[0] ?? "emp-admin",
          dueAt: ctx.nowIso(),
        })
      ) {
        tasks += 1;
      }
    }

    if (job.status === "scheduled" && job.startDate && job.startDate < todayKey) {
      if (
        notifyOnce(
          data,
          ctx,
          {
            employeeId: null,
            title: "Job start date passed",
            body: `${job.title} was scheduled for ${job.startDate} and is still marked scheduled.`,
            href: "/admin/jobs",
            dedupeKey: `job-start:${job.id}`,
          },
          2 * DAY,
        )
      ) {
        notifications += 1;
      }
    }
  }

  return {
    summary: `Job health: ${notifications} alert(s), ${tasks} invoice task(s).`,
    notifications,
    tasks,
  };
}

export function checkInventory(data: AppData, ctx: CheckContext): CheckResult {
  let notifications = 0;
  const low = data.inventory.filter((i) => i.quantityOnHand <= i.reorderLevel);
  for (const item of low) {
    if (
      notifyOnce(data, ctx, {
        employeeId: null,
        title: "Reorder stock",
        body: `${item.name} (${item.sku}): ${item.quantityOnHand} ${item.unit} on hand, reorder at ${item.reorderLevel}.`,
        href: "/admin/inventory",
        dedupeKey: `inventory-low:${item.id}`,
      })
    ) {
      notifications += 1;
    }
  }
  return {
    summary: `Inventory: ${low.length} item(s) at/below reorder level, ${notifications} new alert(s).`,
    notifications,
    tasks: 0,
  };
}

export function checkToolCheckouts(data: AppData, ctx: CheckContext): CheckResult {
  const now = ctx.now ?? Date.now();
  const maxMs = AUTOMATION_THRESHOLDS.toolCheckoutMaxDays() * DAY;
  let notifications = 0;
  let overdue = 0;
  for (const co of data.toolCheckouts) {
    if (co.checkedInAt) continue;
    const age = now - new Date(co.checkedOutAt).getTime();
    if (age <= maxMs) continue;
    overdue += 1;
    const tool = data.tools.find((t) => t.id === co.toolId);
    if (
      notifyOnce(data, ctx, {
        employeeId: co.employeeId,
        title: "Tool checkout overdue",
        body: `${tool?.name ?? co.toolId} out for ${Math.floor(age / DAY)} days — check it in or renew.`,
        href: "/apps/tools",
        dedupeKey: `tool-overdue:${co.id}`,
      })
    ) {
      notifications += 1;
    }
  }
  return {
    summary: `Tools: ${overdue} overdue checkout(s), ${notifications} reminder(s).`,
    notifications,
    tasks: 0,
  };
}

export function checkDamage(data: AppData, ctx: CheckContext): CheckResult {
  const now = ctx.now ?? Date.now();
  const escalateMs = AUTOMATION_THRESHOLDS.damageEscalateHours() * HOUR;
  let notifications = 0;
  for (const r of data.damageReports) {
    if (r.resolved) continue;
    if (r.severity !== "critical" && r.severity !== "high") continue;
    if (now - new Date(r.createdAt).getTime() < escalateMs) continue;
    if (
      notifyOnce(data, ctx, {
        employeeId: null,
        title: `Unresolved ${r.severity} damage`,
        body: `${r.targetLabel}: ${r.description.slice(0, 120)} (reported by ${employeeLabel(data, r.reportedById)})`,
        href: "/admin/damage",
        dedupeKey: `damage-escalate:${r.id}`,
      })
    ) {
      notifications += 1;
    }
  }
  return {
    summary: `Damage escalation: ${notifications} report(s) escalated.`,
    notifications,
    tasks: 0,
  };
}

export function checkFleet(data: AppData, ctx: CheckContext): CheckResult {
  const now = ctx.now ?? Date.now();
  const staleMs = AUTOMATION_THRESHOLDS.fleetStaleDays() * DAY;
  let notifications = 0;
  for (const v of data.vehicles) {
    if (v.status === "maintenance") {
      if (
        notifyOnce(data, ctx, {
          employeeId: v.driverId,
          title: "Vehicle in maintenance",
          body: `${v.name} (${v.plate}) is flagged for maintenance.`,
          href: "/admin/fleet",
          dedupeKey: `fleet-maint:${v.id}`,
        })
      ) {
        notifications += 1;
      }
    }
    if (v.status === "active" && now - new Date(v.lastUpdate).getTime() > staleMs) {
      if (
        notifyOnce(data, ctx, {
          employeeId: v.driverId,
          title: "Stale vehicle location",
          body: `${v.name} has not reported a location in ${Math.floor((now - new Date(v.lastUpdate).getTime()) / DAY)} days.`,
          href: "/admin/fleet",
          dedupeKey: `fleet-stale:${v.id}`,
        })
      ) {
        notifications += 1;
      }
    }
  }
  return {
    summary: `Fleet: ${notifications} alert(s).`,
    notifications,
    tasks: 0,
  };
}

export type DigestSnapshot = {
  newLeads: number;
  qualifiedLeads: number;
  openPoolShifts: number;
  pendingOutreach: number;
  overdueTasks: number;
  lowStock: number;
  unpaidInvoices: number;
  activeJobs: number;
  openTickets: number;
  unresolvedDamage: number;
};

export function buildDigestSnapshot(data: AppData, now = Date.now()): DigestSnapshot {
  return {
    newLeads: data.leads.filter((l) => l.status === "new").length,
    qualifiedLeads: data.leads.filter((l) => l.status === "qualified").length,
    openPoolShifts: data.shifts.filter((s) => s.status === "open_pool").length,
    pendingOutreach: data.outreachQueue.filter((o) => o.status === "pending_approval").length,
    overdueTasks:
      data.activities.filter(
        (a) => a.type === "task" && !a.completedAt && a.dueAt && new Date(a.dueAt).getTime() < now,
      ).length +
      data.knockTodos.filter(
        (t) => !t.completedAt && t.dueAt && new Date(t.dueAt).getTime() < now,
      ).length,
    lowStock: data.inventory.filter((i) => i.quantityOnHand <= i.reorderLevel).length,
    unpaidInvoices: data.invoices.filter((i) => i.kind === "invoice" && i.status === "sent").length,
    activeJobs: data.jobs.filter((j) => j.status === "in_progress" || j.status === "scheduled").length,
    openTickets: data.tickets.filter((t) => t.status !== "closed").length,
    unresolvedDamage: data.damageReports.filter((d) => !d.resolved).length,
  };
}

export function formatDigest(s: DigestSnapshot): string {
  const parts = [
    `${s.newLeads} new lead(s)`,
    `${s.qualifiedLeads} qualified`,
    `${s.activeJobs} active job(s)`,
    `${s.openPoolShifts} open shift(s)`,
    `${s.unpaidInvoices} unpaid invoice(s)`,
    `${s.overdueTasks} overdue task(s)`,
    `${s.lowStock} low-stock item(s)`,
    `${s.openTickets} open ticket(s)`,
  ];
  if (s.pendingOutreach) parts.push(`${s.pendingOutreach} outreach draft(s) awaiting approval`);
  if (s.unresolvedDamage) parts.push(`${s.unresolvedDamage} unresolved damage report(s)`);
  return parts.join(" · ");
}

export function runDailyDigest(data: AppData, ctx: CheckContext): CheckResult {
  const now = ctx.now ?? Date.now();
  const snapshot = buildDigestSnapshot(data, now);
  const body = formatDigest(snapshot);
  const created = notifyOnce(
    data,
    ctx,
    {
      employeeId: null,
      title: "Daily ops digest",
      body,
      href: "/admin/dashboard",
      dedupeKey: `digest:${dayKey(now)}`,
    },
    DAY,
  );
  return {
    summary: `Daily digest: ${body}`,
    notifications: created ? 1 : 0,
    tasks: 0,
  };
}
