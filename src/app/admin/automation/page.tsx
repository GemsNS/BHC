"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MetricStrip, PageFrame, Panel } from "@/components/cc";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import {
  automationStatus,
  runAutomationTick,
  type AutomationStatus,
} from "@/lib/automation-engine";
import { fetchJson, loadAppData, mutateAppData, mutateAppDataAsync } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import { storeHealth, type StoreHealthReport } from "@/lib/store-health";
import type { AutomationTickRecord, InAppNotification, WebhookDelivery } from "@/lib/types";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type SchedulerInfo = {
  enabled: boolean;
  started: boolean;
  running: boolean;
  intervalMin: number;
  startedAt: string | null;
  lastTickAt: string | null;
  nextTickAt: string | null;
  tickCount: number;
  lastError: string | null;
  stale: boolean;
};

type BackupInfo = { name: string; bytes: number; createdAt: string };

type HubPayload = {
  scheduler: SchedulerInfo | null;
  status: AutomationStatus;
  health: StoreHealthReport;
  backups: BackupInfo[];
  recentTicks: AutomationTickRecord[];
  notifications: InAppNotification[];
  webhookBacklog: WebhookDelivery[];
};

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function kb(bytes: number): string {
  return bytes > 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export default function AutomationHubPage() {
  return (
    <RequireAuth perm="workflows">
      <AutomationHub />
    </RequireAuth>
  );
}

function AutomationHub() {
  const { user } = useSession();
  const [payload, setPayload] = useState<HubPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTick, setSelectedTick] = useState<string | null>(null);
  const staticMode = isStaticDemo();

  const refresh = useCallback(async () => {
    setError(null);
    if (!staticMode) {
      try {
        const json = await fetchJson<HubPayload>("/api/automation");
        setPayload(json);
        return;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load automation status");
      }
    }
    const data = await loadAppData();
    setPayload({
      scheduler: null,
      status: automationStatus(data),
      health: storeHealth(data),
      backups: [],
      recentTicks: data.automationRuns.slice(0, 15),
      notifications: data.notifications.slice(0, 30),
      webhookBacklog: [],
    });
  }, [staticMode]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  async function act(label: string, fn: () => Promise<string | void>) {
    setBusy(label);
    setMessage(null);
    setError(null);
    try {
      const msg = await fn();
      if (msg) setMessage(msg);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  function runTick(force: boolean) {
    return act(force ? "tick-force" : "tick", async () => {
      if (staticMode) {
        let record: AutomationTickRecord | null = null;
        await mutateAppDataAsync(async (d) => {
          record = await runAutomationTick(d, {
            source: "ui",
            force,
            newId: () => crypto.randomUUID(),
            nowIso: () => new Date().toISOString(),
            network: false,
          });
        });
        const r = record as AutomationTickRecord | null;
        return r ? `Tick complete — ${r.results.length} result(s).` : "Tick complete.";
      }
      const res = await fetchJson<{ record: AutomationTickRecord }>("/api/automation", {
        method: "POST",
        body: JSON.stringify({ action: "tick", force }),
      });
      return `Tick complete — ${res.record.results.length} result(s), ${res.record.errors.length} error(s), ${res.record.durationMs} ms.`;
    });
  }

  function runOne(id: string) {
    return act(`run:${id}`, async () => {
      if (staticMode) {
        await mutateAppDataAsync(async (d) => {
          await runAutomationTick(d, {
            source: "ui",
            force: true,
            only: [id],
            newId: () => crypto.randomUUID(),
            nowIso: () => new Date().toISOString(),
            network: false,
          });
        });
        return "Automation ran.";
      }
      const res = await fetchJson<{ record: AutomationTickRecord }>("/api/automation", {
        method: "POST",
        body: JSON.stringify({ action: "run", ids: [id] }),
      });
      return res.record.results[0] ?? "Automation ran (nothing to report).";
    });
  }

  function toggle(id: string) {
    return act(`toggle:${id}`, async () => {
      if (staticMode) {
        await mutateAppData((d) => {
          const a = d.assistantAutomations.find((x) => x.id === id);
          if (a) a.enabled = !a.enabled;
        });
        return;
      }
      await fetchJson("/api/automation", {
        method: "POST",
        body: JSON.stringify({ action: "toggle", id }),
      });
    });
  }

  function markAllRead() {
    return act("read", async () => {
      if (staticMode) {
        await mutateAppData((d) => {
          const stamp = new Date().toISOString();
          for (const n of d.notifications) if (!n.readAt) n.readAt = stamp;
        });
        return "Alerts marked read.";
      }
      await fetchJson("/api/automation", {
        method: "POST",
        body: JSON.stringify({ action: "mark_read" }),
      });
      return "Alerts marked read.";
    });
  }

  function retryWebhooks() {
    return act("retry", async () => {
      const res = await fetchJson<{ sent: number; failed: number; abandoned: number }>(
        "/api/automation",
        { method: "POST", body: JSON.stringify({ action: "retry_webhooks" }) },
      );
      return `Webhooks: ${res.sent} delivered, ${res.failed} still failing, ${res.abandoned} abandoned.`;
    });
  }

  function backupNow() {
    return act("backup", async () => {
      const res = await fetchJson<{ ok: boolean; backup: BackupInfo | null }>("/api/automation", {
        method: "POST",
        body: JSON.stringify({ action: "backup", name: "manual" }),
      });
      return res.backup ? `Backup written: ${res.backup.name}` : "Nothing to back up yet.";
    });
  }

  function restore(name: string) {
    if (
      !window.confirm(
        `Restore ${name}?\n\nThe live store will be replaced with this snapshot. A safety copy of the current store is taken first.`,
      )
    ) {
      return;
    }
    return act(`restore:${name}`, async () => {
      const res = await fetchJson<{ restored: string; safetyBackup: string | null }>(
        "/api/automation",
        { method: "POST", body: JSON.stringify({ action: "restore", name }) },
      );
      return `Restored ${res.restored}. Safety copy: ${res.safetyBackup ?? "none"}.`;
    });
  }

  const metrics = useMemo(() => {
    if (!payload) return [];
    const { status, scheduler, health } = payload;
    const enabled = status.automations.filter((a) => a.enabled).length;
    return [
      {
        label: "Automations armed",
        value: `${enabled}/${status.automations.length}`,
        hint: `${status.dueCount} due now`,
        signal: status.dueCount > 0,
      },
      {
        label: "Scheduler",
        value: scheduler ? (scheduler.started ? `every ${scheduler.intervalMin} min` : "off") : "browser",
        hint: scheduler
          ? scheduler.stale
            ? "stale — check host"
            : `next ${fmt(scheduler.nextTickAt)}`
          : "manual ticks only",
        signal: Boolean(scheduler?.stale),
      },
      {
        label: "Last tick",
        value: status.lastTick ? fmt(status.lastTick.finishedAt) : "never",
        hint: status.lastTick
          ? `${status.lastTick.results.length} results · ${status.lastTick.errors.length} errors`
          : "run one below",
        signal: Boolean(status.lastTick?.errors.length),
      },
      {
        label: "Webhook backlog",
        value: status.webhookBacklog,
        hint: status.webhookBacklog ? "awaiting retry" : "all delivered",
        signal: status.webhookBacklog > 0,
      },
      {
        label: "Store",
        value: `${health.approxMB} MB`,
        hint: health.ok ? `${health.issues.length} warning(s)` : "integrity errors",
        signal: !health.ok,
      },
    ];
  }, [payload]);

  if (!payload) {
    return (
      <PageFrame context="Administration" title="Automation hub" subtitle="Loading engine status…">
        {error ? <p className="cc-empty">{error}</p> : <p className="cc-empty">Loading…</p>}
      </PageFrame>
    );
  }

  const { status, scheduler, health, backups, recentTicks, notifications, webhookBacklog } = payload;
  const unread = notifications.filter((n) => !n.readAt);
  const tick = recentTicks.find((t) => t.id === selectedTick) ?? recentTicks[0] ?? null;

  return (
    <PageFrame
      context="Administration"
      title="Automation hub"
      subtitle="Everything BHC does unattended: reminders, follow-ups, health checks, webhooks, backups. Runs on the server every few minutes and after every deploy."
      actions={
        <>
          <button
            type="button"
            className="btn-secondary !py-1.5 !text-xs"
            disabled={busy !== null}
            onClick={() => runTick(false)}
          >
            {busy === "tick" ? "Running…" : "Run due now"}
          </button>
          <button
            type="button"
            className="btn-primary !py-1.5 !text-xs"
            disabled={busy !== null}
            onClick={() => runTick(true)}
          >
            {busy === "tick-force" ? "Running…" : "Force-run all"}
          </button>
        </>
      }
    >
      {message ? <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{message}</p> : null}
      {error ? <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p> : null}
      {staticMode ? (
        <p className="cc-empty">
          Static demo: ticks run in this browser only. Webhook delivery, backups, and the background scheduler need the Node host.
        </p>
      ) : null}

      <MetricStrip items={metrics} />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Automations" action={<span className="text-xs text-[var(--muted)]">{status.automations.filter((a) => a.enabled).length} enabled</span>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="py-2 pr-3">Automation</th>
                  <th className="py-2 pr-3">Schedule</th>
                  <th className="py-2 pr-3">Last run</th>
                  <th className="py-2 pr-3">State</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {status.automations.map((a) => (
                  <tr key={a.id} className="border-t border-white/10 align-top">
                    <td className="py-2 pr-3">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-[var(--muted)]">{a.action}</p>
                    </td>
                    <td className="py-2 pr-3 text-xs">{a.schedule}</td>
                    <td className="py-2 pr-3 text-xs">{fmt(a.lastRunAt)}</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge status={a.enabled ? "enabled" : "disabled"} />
                        {a.due ? <StatusBadge status="due" /> : null}
                      </div>
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        className="linkish text-xs"
                        disabled={busy !== null}
                        onClick={() => runOne(a.id)}
                      >
                        {busy === `run:${a.id}` ? "…" : "Run"}
                      </button>
                      <span className="mx-1 text-[var(--muted)]">·</span>
                      <button
                        type="button"
                        className="linkish text-xs"
                        disabled={busy !== null}
                        onClick={() => toggle(a.id)}
                      >
                        {a.enabled ? "Pause" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Event workflows (lead won → job, job completed → invoice, damage → alert) live in{" "}
            <Link href="/admin/sales?tab=automation" className="linkish">
              Sales → Automation
            </Link>
            . Templates ship paused; enable the ones you want.
          </p>
        </Panel>

        <div className="grid gap-4">
          <Panel title="Scheduler">
            {scheduler ? (
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-[var(--muted)]">Mode</dt>
                <dd>{scheduler.enabled ? (scheduler.started ? "in-process" : "starting…") : "disabled (BHC_SCHEDULER=0)"}</dd>
                <dt className="text-[var(--muted)]">Interval</dt>
                <dd>{scheduler.intervalMin} min</dd>
                <dt className="text-[var(--muted)]">Booted</dt>
                <dd>{fmt(scheduler.startedAt)}</dd>
                <dt className="text-[var(--muted)]">Ticks since boot</dt>
                <dd>{scheduler.tickCount}</dd>
                <dt className="text-[var(--muted)]">Next tick</dt>
                <dd className={cn(scheduler.stale && "text-amber-300")}>{fmt(scheduler.nextTickAt)}</dd>
                {scheduler.lastError ? (
                  <>
                    <dt className="text-[var(--muted)]">Last error</dt>
                    <dd className="text-rose-300">{scheduler.lastError}</dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <p className="cc-empty">No server scheduler in the browser demo.</p>
            )}
            <p className="mt-3 text-xs text-[var(--muted)]">
              External cron alternative: <code>npm run bhc -- automations tick</code> or{" "}
              <code>POST /api/automation</code> with <code>x-bhc-automation-secret</code>.
            </p>
          </Panel>

          <Panel
            title={`Alerts (${unread.length} unread)`}
            action={
              unread.length ? (
                <button type="button" className="linkish text-xs" disabled={busy !== null} onClick={markAllRead}>
                  Mark all read
                </button>
              ) : null
            }
          >
            {notifications.length ? (
              <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
                {notifications.map((n) => (
                  <li key={n.id} className={cn("rounded-md border border-white/10 px-3 py-2", n.readAt && "opacity-50")}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{n.title}</p>
                      <time className="shrink-0 text-xs text-[var(--muted)]">{fmt(n.createdAt)}</time>
                    </div>
                    <p className="text-xs text-[var(--muted)]">{n.body}</p>
                    {n.href ? (
                      <Link href={n.href} className="linkish text-xs">
                        Open
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cc-empty">No alerts yet — the engine posts here when something needs a human.</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Recent ticks">
          {recentTicks.length ? (
            <div className="grid gap-3 md:grid-cols-[220px_1fr]">
              <ul className="space-y-1 text-xs">
                {recentTicks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left hover:bg-white/5",
                        tick?.id === t.id && "bg-white/10",
                      )}
                      onClick={() => setSelectedTick(t.id)}
                    >
                      <span className="font-medium">{fmt(t.finishedAt)}</span>
                      <span className="text-[var(--muted)]"> · {t.source} · {t.results.length}r</span>
                      {t.errors.length ? <span className="text-rose-300"> · {t.errors.length} err</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
              {tick ? (
                <div className="text-sm">
                  <p className="text-xs text-[var(--muted)]">
                    {tick.durationMs} ms · {tick.counters.automationsRun} automation(s) · {tick.counters.notificationsCreated} alert(s) · {tick.counters.tasksCreated} task(s) · {tick.counters.sequenceSteps} sequence step(s) · webhooks {tick.counters.webhooksSent}/{tick.counters.webhooksFailed}
                    {tick.counters.backupCreated ? " · backup" : ""}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {tick.results.map((r, i) => (
                      <li key={i} className="rounded bg-white/5 px-2 py-1">{r}</li>
                    ))}
                    {tick.errors.map((e, i) => (
                      <li key={`e${i}`} className="rounded bg-rose-500/10 px-2 py-1 text-rose-200">{e}</li>
                    ))}
                    {!tick.results.length && !tick.errors.length ? (
                      <li className="text-[var(--muted)]">Quiet tick — nothing was due.</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="cc-empty">No ticks recorded. Run one above or wait for the scheduler.</p>
          )}
        </Panel>

        <div className="grid gap-4">
          <Panel
            title={`Webhook backlog (${webhookBacklog.length})`}
            action={
              !staticMode && webhookBacklog.length ? (
                <button type="button" className="linkish text-xs" disabled={busy !== null} onClick={retryWebhooks}>
                  Retry now
                </button>
              ) : null
            }
          >
            {webhookBacklog.length ? (
              <ul className="space-y-1 text-xs">
                {webhookBacklog.map((d) => (
                  <li key={d.id} className="flex justify-between gap-2 rounded bg-white/5 px-2 py-1">
                    <span>
                      {d.event} · attempt {d.attempts} · {d.lastError ?? "pending"}
                    </span>
                    <span className="text-[var(--muted)]">retry {fmt(d.nextRetryAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cc-empty">Every webhook has been delivered.</p>
            )}
          </Panel>

          <Panel
            title="Store health & backups"
            action={
              !staticMode ? (
                <button type="button" className="linkish text-xs" disabled={busy !== null} onClick={backupNow}>
                  {busy === "backup" ? "…" : "Back up now"}
                </button>
              ) : null
            }
          >
            <div className="flex flex-wrap gap-2 text-xs">
              <StatusBadge status={health.ok ? "healthy" : "critical"} />
              <span className="text-[var(--muted)]">
                {health.approxMB} MB · {health.counts.leads} leads · {health.counts.jobs} jobs · {health.counts.invoices} invoices · {health.photoDataUrls} inline photos
              </span>
            </div>
            {health.issues.length ? (
              <ul className="mt-2 space-y-1 text-xs">
                {health.issues.map((i) => (
                  <li key={i.code} className={cn("rounded px-2 py-1", i.level === "error" ? "bg-rose-500/10 text-rose-200" : "bg-amber-500/10 text-amber-100")}>
                    {i.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-[var(--muted)]">No integrity issues.</p>
            )}
            {!staticMode ? (
              <div className="mt-3">
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Snapshots ({backups.length})</p>
                {backups.length ? (
                  <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs">
                    {backups.map((b) => (
                      <li key={b.name} className="flex items-center justify-between gap-2 rounded bg-white/5 px-2 py-1">
                        <span className="truncate">{b.name}</span>
                        <span className="shrink-0 text-[var(--muted)]">{kb(b.bytes)}</span>
                        {user?.role === "admin" ? (
                          <button type="button" className="linkish shrink-0" disabled={busy !== null} onClick={() => restore(b.name)}>
                            Restore
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-[var(--muted)]">No snapshots yet. The nightly backup automation creates one at 2am, or click Back up now.</p>
                )}
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    </PageFrame>
  );
}
