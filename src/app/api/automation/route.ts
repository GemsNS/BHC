import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiEmployee } from "@/lib/api-auth";
import { automationStatus } from "@/lib/automation-engine";
import { runServerTick, schedulerInfo } from "@/lib/scheduler";
import { createBackup, listBackups, restoreBackup } from "@/lib/store-backup";
import { storeHealth } from "@/lib/store-health";
import { newId, nowIso, readStore, updateStore, updateStoreAsync } from "@/lib/store";
import { deliverPendingWebhooks, webhookBacklog } from "@/lib/webhooks";

/**
 * Automation engine control plane.
 *
 * Auth: either an admin/manager staff session header, or the shared secret
 * `x-bhc-automation-secret: $AUTOMATION_SECRET` (for cron / systemd / CI).
 */

async function authorize(request: Request): Promise<NextResponse | null> {
  const secret = process.env.AUTOMATION_SECRET?.trim();
  const header = request.headers.get("x-bhc-automation-secret")?.trim();
  if (secret && header && header === secret) return null;
  const employee = await getApiEmployee(request);
  if (employee && (employee.role === "admin" || employee.role === "manager")) return null;
  if (!secret && process.env.NODE_ENV !== "production") {
    // Local dev convenience: allow unauthenticated ticks when no secret is set
    return null;
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;
  const data = await readStore();
  const status = automationStatus(data);
  const backups = await listBackups();
  return NextResponse.json({
    scheduler: schedulerInfo(),
    status,
    health: storeHealth(data),
    backups: backups.slice(0, 20),
    recentTicks: data.automationRuns.slice(0, 15),
    notifications: data.notifications.slice(0, 30),
    webhookBacklog: webhookBacklog(data).slice(0, 20),
  });
}

const bodySchema = z.object({
  action: z.enum([
    "tick",
    "run",
    "toggle",
    "backup",
    "restore",
    "retry_webhooks",
    "mark_read",
    "clear_notifications",
  ]),
  force: z.boolean().optional(),
  ids: z.array(z.string()).optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  enabled: z.boolean().optional(),
});

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  switch (body.action) {
    case "tick": {
      const record = await runServerTick({ source: "api", force: body.force });
      return NextResponse.json({ ok: true, record });
    }
    case "run": {
      const ids = body.ids ?? (body.id ? [body.id] : []);
      if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
      const record = await runServerTick({ source: "ui", force: true, only: ids });
      return NextResponse.json({ ok: true, record });
    }
    case "toggle": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      let found = false;
      const data = await updateStore((d) => {
        const auto = d.assistantAutomations.find((a) => a.id === body.id);
        if (!auto) return;
        found = true;
        auto.enabled = body.enabled ?? !auto.enabled;
      });
      if (!found) return NextResponse.json({ error: "Automation not found" }, { status: 404 });
      return NextResponse.json({ ok: true, automations: data.assistantAutomations });
    }
    case "backup": {
      const info = await createBackup({ label: body.name?.replace(/[^a-z0-9-]/gi, "") || "manual" });
      return NextResponse.json({ ok: Boolean(info), backup: info });
    }
    case "restore": {
      if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
      try {
        const result = await restoreBackup(body.name);
        return NextResponse.json({ ok: true, ...result });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "restore failed" },
          { status: 400 },
        );
      }
    }
    case "retry_webhooks": {
      let result = { sent: 0, failed: 0, abandoned: 0 };
      await updateStoreAsync(async (d) => {
        // Force-retry: bring every retryable delivery forward to now
        const now = nowIso();
        for (const del of webhookBacklog(d)) del.nextRetryAt = now;
        result = await deliverPendingWebhooks(d, nowIso);
      });
      return NextResponse.json({ ok: true, ...result });
    }
    case "mark_read": {
      const stamp = nowIso();
      await updateStore((d) => {
        const ids = body.ids ? new Set(body.ids) : null;
        for (const n of d.notifications) {
          if (!n.readAt && (!ids || ids.has(n.id))) n.readAt = stamp;
        }
      });
      return NextResponse.json({ ok: true });
    }
    case "clear_notifications": {
      await updateStore((d) => {
        d.notifications = d.notifications.filter((n) => !n.readAt);
      });
      return NextResponse.json({ ok: true, id: newId() });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
