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
import type { AgentRuntimeStatus } from "@/lib/agent-harness";
import { fetchJson, loadAppData, mutateAppData, mutateAppDataAsync } from "@/lib/client-data";
import type { ScoutStatus } from "@/lib/lead-scout";
import { isStaticDemo } from "@/lib/paths";
import { storeHealth, type StoreHealthReport } from "@/lib/store-health";
import type {
  AgentRunRecord,
  AutomationTickRecord,
  InAppNotification,
  ScoutPlatform,
  WebhookDelivery,
} from "@/lib/types";
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
  /** Autonomous agent + own-PC lead scout (server mode only) */
  agent?: AgentRuntimeStatus | null;
  agentRuns?: AgentRunRecord[];
  scout?: ScoutStatus | null;
};

const SCOUT_PLATFORM_OPTIONS: ScoutPlatform[] = ["kijiji", "craigslist", "reddit", "facebook", "web"];

const TAG_TONES: Record<string, string> = {
  online: "bg-emerald-500/20 text-emerald-200",
  offline: "bg-stone-500/30 text-stone-300",
  queued: "bg-amber-500/20 text-amber-200",
  running: "bg-sky-500/20 text-sky-200",
  done: "bg-emerald-500/20 text-emerald-200",
  failed: "bg-rose-500/20 text-rose-200",
  schedule: "bg-sky-500/20 text-sky-200",
  wake: "bg-amber-500/20 text-amber-200",
  manual: "bg-violet-500/20 text-violet-200",
  test: "bg-stone-500/30 text-stone-300",
  ok: "bg-emerald-500/20 text-emerald-200",
  refused: "bg-rose-500/20 text-rose-200",
  error: "bg-orange-500/20 text-orange-200",
  skipped: "bg-stone-500/30 text-stone-300",
};

function Tag({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        TAG_TONES[tone] ?? "bg-stone-500/30 text-stone-300",
      )}
    >
      {children}
    </span>
  );
}

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
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [scanPlatform, setScanPlatform] = useState<ScoutPlatform>("kijiji");
  const [scanQuery, setScanQuery] = useState("");
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
      agent: null,
      agentRuns: [],
      scout: null,
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

  function runAgent() {
    return act("agent-run", async () => {
      const res = await fetchJson<{ ok: boolean; agentRun: AgentRunRecord | null; record: AutomationTickRecord }>(
        "/api/automation",
        { method: "POST", body: JSON.stringify({ action: "agent_run" }) },
      );
      const run = res.agentRun;
      if (!run) return res.record?.results[0] ?? "Agent tick ran (no run recorded).";
      if (run.skipped) return `Agent skipped (${run.skipped.replace(/_/g, " ")}): ${run.error ?? run.needsHuman[0] ?? "see status"}`;
      setSelectedRun(run.id);
      return `Agent run done — ${run.did.length} did · ${run.needsHuman.length} need human · ${run.toolRuns.length} tool call(s) · ${run.webSearches} web search(es).`;
    });
  }

  function enqueueScan(e: React.FormEvent) {
    e.preventDefault();
    const query = scanQuery.trim();
    if (query.length < 4) {
      setError("Enter a search phrase (at least 4 characters).");
      return;
    }
    return act("scan", async () => {
      const res = await fetchJson<{ ok: boolean; existing?: boolean; taskId?: string }>("/api/automation", {
        method: "POST",
        body: JSON.stringify({ action: "scout_enqueue", platform: scanPlatform, query }),
      });
      setScanQuery("");
      return `${res.existing ? "Already queued" : "Queued"} ${scanPlatform} scan "${query}".`;
    });
  }

  const metrics = useMemo(() => {
    if (!payload) return [];
    const { status, scheduler, health, agent, scout } = payload;
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
      {
        label: "AI agent",
        value: agent ? (agent.envEnabled ? agent.autonomy : "off") : "browser",
        hint: agent
          ? agent.lastRunAt
            ? `last run ${fmt(agent.lastRunAt)}`
            : "never ran"
          : "server mode only",
        signal: Boolean(agent && agent.automationEnabled && !agent.envEnabled),
      },
      {
        label: "Lead scout",
        value: scout ? `${scout.onlineRunners} online` : "—",
        hint: scout ? `${scout.queued} queued · ${scout.running} running` : "server mode only",
        signal: Boolean(scout && scout.queued > 0 && scout.onlineRunners === 0),
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
  const agent = payload.agent ?? null;
  const agentRuns = payload.agentRuns ?? [];
  const scout = payload.scout ?? null;
  const unread = notifications.filter((n) => !n.readAt);
  const tick = recentTicks.find((t) => t.id === selectedTick) ?? recentTicks[0] ?? null;
  const run = agentRuns.find((r) => r.id === selectedRun) ?? null;

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

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Autonomous agent"
          action={
            !staticMode ? (
              <button
                type="button"
                className="btn-secondary !py-1 !text-xs"
                disabled={busy !== null || !agent?.envEnabled}
                title={agent?.envEnabled ? "Force one agent sweep now" : "Set AGENT_HARNESS_ENABLED=1 on the server first"}
                onClick={runAgent}
              >
                {busy === "agent-run" ? "Running…" : "Run agent now"}
              </button>
            ) : null
          }
        >
          {staticMode || !agent ? (
            <p className="cc-empty">
              The autonomous Mainframe agent runs on the Node host only. In server mode it hunts the web for homeowner job
              requests, feeds the ad pipeline, keeps tasks current, and lists anything that needs a human.
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm sm:grid-cols-4">
                <dt className="text-[var(--muted)]">Kill-switch</dt>
                <dd>
                  <StatusBadge status={agent.envEnabled ? "enabled" : "disabled"} />
                </dd>
                <dt className="text-[var(--muted)]">Automation</dt>
                <dd>
                  <StatusBadge status={agent.automationEnabled ? "enabled" : "paused"} />
                </dd>
                <dt className="text-[var(--muted)]">Autonomy</dt>
                <dd className="font-medium">{agent.autonomy}</dd>
                <dt className="text-[var(--muted)]">Provider</dt>
                <dd className="truncate">
                  {agent.provider}
                  {agent.model ? <span className="text-xs text-[var(--muted)]"> · {agent.model}</span> : null}
                </dd>
                <dt className="text-[var(--muted)]">Web search</dt>
                <dd>{agent.webSearch ? "on" : "off"}</dd>
                <dt className="text-[var(--muted)]">Cadence</dt>
                <dd>
                  every {agent.intervalMin ?? "?"} min · min gap {agent.minGapMin} min
                </dd>
                <dt className="text-[var(--muted)]">Runs today</dt>
                <dd className={cn(agent.runsToday >= agent.maxRunsPerDay && "text-amber-300")}>
                  {agent.runsToday}/{agent.maxRunsPerDay} · {agent.maxSteps} steps max
                </dd>
                <dt className="text-[var(--muted)]">Open goals</dt>
                <dd>
                  {agent.openGoals} · {agent.crmTools + agent.agentTools} tools
                </dd>
              </dl>
              {agent.automationEnabled && !agent.envEnabled ? (
                <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  The automation is on but the kill-switch is off. Set <code>AGENT_HARNESS_ENABLED=1</code> on the server to let it run.
                </p>
              ) : null}
              {agent.wakeReasons.length ? (
                <div className="mt-3 text-xs">
                  <p className="uppercase tracking-wide text-[var(--muted)]">Will wake for</p>
                  <ul className="mt-1 space-y-1">
                    {agent.wakeReasons.map((r, i) => (
                      <li key={i} className="rounded bg-amber-500/10 px-2 py-1 text-amber-100">
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="mt-3 text-xs uppercase tracking-wide text-[var(--muted)]">Recent runs</p>
              {agentRuns.length ? (
                <ul className="mt-1 space-y-1 text-xs">
                  {agentRuns.map((r) => {
                    const open = run?.id === r.id;
                    return (
                      <li key={r.id} className="rounded-md border border-white/10">
                        <button
                          type="button"
                          className={cn("flex w-full flex-wrap items-center gap-2 px-2 py-1.5 text-left hover:bg-white/5", open && "bg-white/10")}
                          onClick={() => setSelectedRun(open ? null : r.id)}
                        >
                          <Tag tone={r.trigger}>{r.trigger}</Tag>
                          {r.skipped ? <Tag tone="skipped">skipped · {r.skipped.replace(/_/g, " ")}</Tag> : null}
                          <span className="font-medium">{fmt(r.finishedAt)}</span>
                          <span className="text-[var(--muted)]">
                            {r.autonomy} · {r.durationMs} ms · {r.did.length} did ·{" "}
                            <span className={cn(r.needsHuman.length > 0 && "text-amber-200")}>{r.needsHuman.length} need human</span> ·{" "}
                            {r.toolRuns.length} tools · {r.webSearches} searches
                          </span>
                        </button>
                        {open ? (
                          <div className="space-y-2 border-t border-white/10 px-3 py-2">
                            {r.wakeReasons.length ? (
                              <p className="text-[var(--muted)]">Woke for: {r.wakeReasons.join("; ")}</p>
                            ) : null}
                            {r.error ? <p className="rounded bg-rose-500/10 px-2 py-1 text-rose-200">{r.error}</p> : null}
                            {(
                              [
                                ["DID", r.did, "bg-emerald-500/10 text-emerald-100"],
                                ["NEEDS HUMAN", r.needsHuman, "bg-amber-500/10 text-amber-100"],
                                ["NOTED", r.noted, "bg-white/5"],
                              ] as Array<[string, string[], string]>
                            ).map(([label, items, klass]) => (
                              <div key={label}>
                                <p className="uppercase tracking-wide text-[var(--muted)]">{label}</p>
                                {items.length ? (
                                  <ul className="mt-1 space-y-1">
                                    {items.map((line, i) => (
                                      <li key={i} className={cn("rounded px-2 py-1", klass)}>
                                        {line}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-[var(--muted)]">none</p>
                                )}
                              </div>
                            ))}
                            {r.toolRuns.length ? (
                              <div>
                                <p className="uppercase tracking-wide text-[var(--muted)]">Tool calls</p>
                                <ul className="mt-1 space-y-1">
                                  {r.toolRuns.map((t, i) => (
                                    <li key={i} className="flex items-start gap-2 rounded bg-white/5 px-2 py-1">
                                      <Tag tone={t.refused ? "refused" : t.ok ? "ok" : "error"}>
                                        {t.refused ? "refused" : t.ok ? "ok" : "error"}
                                      </Tag>
                                      <span className="min-w-0">
                                        <span className="font-medium">{t.tool}</span>
                                        <span className="text-[var(--muted)]"> — {t.summary.slice(0, 180)}{t.summary.length > 180 ? "…" : ""}</span>
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="cc-empty mt-1">
                  No agent runs yet. Set <code>AGENT_HARNESS_ENABLED=1</code> and enable &ldquo;Mainframe ops sweep&rdquo; below.
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel
          title="Lead scout (your PC)"
          action={
            scout ? (
              <span className="text-xs text-[var(--muted)]">
                {scout.onlineRunners}/{scout.runners.length} online · {scout.doneToday} scans today
                {scout.failedToday ? ` · ${scout.failedToday} failed` : ""}
              </span>
            ) : null
          }
        >
          {staticMode || !scout ? (
            <p className="cc-empty">
              The lead scout is a small worker you run on your own PC (residential IP). It heartbeats to the server, picks up
              scans the agent requests, scrapes Kijiji / Craigslist / Reddit / Facebook Marketplace / the web, and posts
              homeowner job requests into the ad pipeline. Server mode only.
            </p>
          ) : (
            <>
              {scout.runners.length ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {scout.runners.map((r) => (
                    <li key={r.id} className="rounded-md border border-white/10 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{r.name}</p>
                        <Tag tone={r.online ? "online" : "offline"}>{r.online ? "online" : "offline"}</Tag>
                      </div>
                      <p className="text-[var(--muted)]">
                        {r.host} · v{r.version} · {r.platforms.join(", ") || "no platforms"}
                      </p>
                      <p className="text-[var(--muted)]">
                        seen {fmt(r.lastSeenAt)} · {r.tasksDone} scans · {r.adsPosted} ads posted
                      </p>
                      {r.lastSummary ? <p className="mt-1 truncate">{r.lastSummary}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="cc-empty">No scout runner has checked in yet.</p>
              )}

              <form onSubmit={enqueueScan} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <select
                  className="rounded-md border border-white/10 bg-transparent px-2 py-1.5 text-sm"
                  value={scanPlatform}
                  onChange={(e) => setScanPlatform(e.target.value as ScoutPlatform)}
                  disabled={busy !== null}
                >
                  {SCOUT_PLATFORM_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-transparent px-2 py-1.5 text-sm"
                  placeholder='e.g. "looking for siding contractor"'
                  value={scanQuery}
                  onChange={(e) => setScanQuery(e.target.value)}
                  maxLength={200}
                  disabled={busy !== null}
                />
                <button type="submit" className="btn-secondary !py-1.5 !text-xs" disabled={busy !== null}>
                  {busy === "scan" ? "Queueing…" : "Queue scan"}
                </button>
              </form>

              <p className="mt-3 text-xs uppercase tracking-wide text-[var(--muted)]">Scan queue</p>
              {scout.recent.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left uppercase tracking-wide text-[var(--muted)]">
                      <tr>
                        <th className="py-1 pr-2">State</th>
                        <th className="py-1 pr-2">Platform</th>
                        <th className="py-1 pr-2">Query</th>
                        <th className="py-1 pr-2">Found / created</th>
                        <th className="py-1 pr-2">By</th>
                        <th className="py-1">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scout.recent.map((t) => (
                        <tr key={t.id} className="border-t border-white/10 align-top">
                          <td className="py-1 pr-2">
                            <Tag tone={t.status}>{t.status}</Tag>
                          </td>
                          <td className="py-1 pr-2">{t.platform}</td>
                          <td className="py-1 pr-2">
                            <span className="line-clamp-2">{t.query}</span>
                            {t.error ? <span className="block text-rose-300">{t.error.slice(0, 80)}</span> : null}
                          </td>
                          <td className="py-1 pr-2 whitespace-nowrap">
                            {t.status === "done" ? `${t.found} / ${t.created}` : "—"}
                          </td>
                          <td className="py-1 pr-2 whitespace-nowrap">{t.requestedBy}</td>
                          <td className="py-1 whitespace-nowrap text-[var(--muted)]">{fmt(t.completedAt ?? t.claimedAt ?? t.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="cc-empty mt-1">No scans yet. Queue one above or let the agent request them.</p>
              )}

              <div className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs">
                <p className="text-[var(--muted)]">Run this on the PC that should scrape (residential IP works best):</p>
                <pre className="mt-1 overflow-x-auto rounded bg-black/30 px-2 py-1 font-mono">npm run scout -- --daemon</pre>
                <p className="mt-1 text-[var(--muted)]">
                  Windows: <code>deploy/windows/install-lead-scout.ps1</code> registers it as a logon task. Needs{" "}
                  <code>ADS_INBOUND_SECRET</code> + <code>BHC_BASE_URL</code> in <code>.env</code>.
                </p>
              </div>
            </>
          )}
        </Panel>
      </div>

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
