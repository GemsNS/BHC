import { NextResponse } from "next/server";
import { z } from "zod";
import { agentRuntimeStatus } from "@/lib/agent-harness";
import { getApiEmployee } from "@/lib/api-auth";
import { automationStatus } from "@/lib/automation-engine";
import { enqueueScoutTask, parseScoutPlatform, scoutStatus } from "@/lib/lead-scout";
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
    // Autonomous agent + own-PC lead scout
    agent: agentRuntimeStatus(data),
    agentRuns: (data.agentRuns ?? []).slice(0, 10),
    scout: scoutStatus(data),
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
    "agent_run",
    "scout_enqueue",
  ]),
  force: z.boolean().optional(),
  ids: z.array(z.string()).optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  platform: z.string().optional(),
  query: z.string().max(200).optional(),
  region: z.string().max(120).optional(),
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
    case "agent_run": {
      // Run one agent sweep now, even if the scheduled automation is toggled off.
      // Still subject to the AGENT_HARNESS_ENABLED kill-switch, the daily run cap,
      // and the AI budget (all enforced inside runAgentOpsSweep).
      const { runAgentOpsSweep, agentHarnessEnvEnabled } = await import("@/lib/agent-harness");
      if (!agentHarnessEnvEnabled()) {
        return NextResponse.json(
          { error: "Agent kill-switch is off — set AGENT_HARNESS_ENABLED=1 on the host and restart." },
          { status: 409 },
        );
      }
      let result: Awaited<ReturnType<typeof runAgentOpsSweep>> | null = null;
      const after = await updateStoreAsync(async (d) => {
        result = await runAgentOpsSweep(d, { newId, nowIso }, { trigger: "manual" });
        const auto = d.assistantAutomations.find((a) => a.action === "agent_ops");
        if (auto) auto.lastRunAt = nowIso();
      });
      const r = result as Awaited<ReturnType<typeof runAgentOpsSweep>> | null;
      return NextResponse.json({
        ok: Boolean(r?.ok),
        summary: r?.summary ?? "Agent did not run.",
        skipped: r?.skipped ?? null,
        record: { results: [r?.summary ?? "Agent did not run."], errors: [] },
        agent: agentRuntimeStatus(after),
        agentRun: r?.record ?? null,
      });
    }
    case "scout_enqueue": {
      const platform = parseScoutPlatform(body.platform);
      const query = body.query?.trim() ?? "";
      if (!platform) return NextResponse.json({ error: "platform must be kijiji, craigslist, reddit, facebook, or web" }, { status: 400 });
      if (query.length < 4) return NextResponse.json({ error: "query required" }, { status: 400 });
      const employee = await getApiEmployee(request);
      let result: { existing: boolean; taskId: string } | null = null;
      let failure: string | null = null;
      const data = await updateStore((d) => {
        try {
          const r = enqueueScoutTask(
            d,
            { platform, query, region: body.region?.trim() || undefined, requestedBy: employee?.id ?? "ui" },
            { newId, nowIso },
          );
          result = { existing: r.existing, taskId: r.task.id };
        } catch (err) {
          failure = err instanceof Error ? err.message : String(err);
        }
      });
      if (failure) return NextResponse.json({ error: failure }, { status: 400 });
      return NextResponse.json({ ok: true, ...(result ?? {}), scout: scoutStatus(data) });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
