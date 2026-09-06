"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { withBasePath, isStaticDemo } from "@/lib/paths";
import { recentEvents, type LiveEvent, type LiveEventKind } from "@/lib/events";
import { cn } from "@/lib/utils";

type SchedulerInfo = { started: boolean; intervalMin: number; nextTickAt: string | null; stale: boolean } | null;

const KIND_LABEL: Record<LiveEventKind, string> = {
  tick: "TICK",
  automation: "AUTO",
  ad: "AD",
  outreach: "OUT",
  reply: "REPLY",
  lead: "LEAD",
  job: "JOB",
  invoice: "INV",
  payment: "PAY",
  document: "DOC",
  webhook: "HOOK",
  ai: "AI",
  discovery: "SCAN",
  message: "MSG",
  call: "CALL",
  system: "SYS",
  auth: "AUTH",
};

function levelClass(level: LiveEvent["level"]): string {
  switch (level) {
    case "success":
      return "text-emerald-300";
    case "warn":
      return "text-amber-300";
    case "error":
      return "text-rose-300";
    case "ai":
      return "text-fuchsia-300";
    case "out":
      return "text-sky-300";
    case "in":
      return "text-teal-300";
    default:
      return "text-stone-300";
  }
}

function refHref(refs: LiveEvent["refs"]): string | null {
  if (!refs) return null;
  if (refs.jobId) return `/admin/jobs/${refs.jobId}`;
  if (refs.adId) return "/admin/ads";
  if (refs.leadId) return "/admin/sales?tab=pipeline";
  if (refs.invoiceId) return "/admin/invoices";
  return null;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Terminal-style live feed of everything the system does. Connects to
 * GET /api/stream (SSE); in the static demo it shows the in-memory buffer.
 */
export function LiveWire({
  compact = false,
  maxRows = compact ? 12 : 200,
  className,
  showHeader = true,
}: {
  compact?: boolean;
  maxRows?: number;
  className?: string;
  showHeader?: boolean;
}) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "offline" | "demo">("connecting");
  const [scheduler, setScheduler] = useState<SchedulerInfo>(null);
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<"all" | "outreach" | "ai" | "ops">("all");
  const listRef = useRef<HTMLOListElement>(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    if (isStaticDemo()) {
      setStatus("demo");
      setEvents(recentEvents({ limit: maxRows }));
      const t = window.setInterval(() => setEvents(recentEvents({ limit: maxRows })), 2000);
      return () => window.clearInterval(t);
    }
    let es: EventSource | null = null;
    let retry: number | null = null;
    const connect = () => {
      es = new EventSource(withBasePath(`/api/stream?backlog=${Math.min(maxRows, 200)}`));
      es.addEventListener("hello", (e) => {
        const j = JSON.parse((e as MessageEvent).data);
        setScheduler(j.scheduler ?? null);
        setCounters(j.counters ?? {});
        setStatus("live");
      });
      es.addEventListener("heartbeat", (e) => {
        const j = JSON.parse((e as MessageEvent).data);
        setScheduler(j.scheduler ?? null);
        setCounters(j.counters ?? {});
      });
      es.addEventListener("event", (e) => {
        if (pausedRef.current) return;
        const ev = JSON.parse((e as MessageEvent).data) as LiveEvent;
        setEvents((prev) => {
          if (prev.some((p) => p.id === ev.id)) return prev;
          const next = [...prev, ev];
          return next.length > maxRows ? next.slice(next.length - maxRows) : next;
        });
      });
      es.onerror = () => {
        setStatus("offline");
        es?.close();
        retry = window.setTimeout(connect, 4000);
      };
    };
    connect();
    return () => {
      es?.close();
      if (retry) window.clearTimeout(retry);
    };
  }, [maxRows]);

  useEffect(() => {
    if (paused) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events, paused]);

  const visible = useMemo(() => {
    if (filter === "all") return events;
    const sets: Record<string, LiveEventKind[]> = {
      outreach: ["ad", "outreach", "reply", "discovery", "message", "call", "lead"],
      ai: ["ai", "discovery"],
      ops: ["tick", "automation", "job", "invoice", "payment", "document", "webhook", "system", "auth"],
    };
    const allowed = new Set(sets[filter]);
    return events.filter((e) => allowed.has(e.kind));
  }, [events, filter]);

  const outCount = (counters.outreach ?? 0) + (counters.document ?? 0);
  const inCount = (counters.ad ?? 0) + (counters.reply ?? 0) + (counters.message ?? 0) + (counters.call ?? 0);

  return (
    <section className={cn("live-wire", compact && "live-wire-compact", className)}>
      {showHeader ? (
        <header className="live-wire-head">
          <div className="flex items-center gap-2">
            <span className={cn("live-dot", status === "live" && "live-dot-on", status === "offline" && "live-dot-off")} aria-hidden />
            <span className="live-wire-title">LIVE WIRE</span>
            <span className="live-wire-sub">
              {status === "live"
                ? scheduler?.started
                  ? `engine every ${scheduler.intervalMin} min${scheduler.stale ? " · STALE" : ""}`
                  : "engine idle"
                : status === "demo"
                  ? "browser demo"
                  : status === "offline"
                    ? "reconnecting…"
                    : "connecting…"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="live-wire-stat" title="ads, replies, messages, calls in">↓ {inCount}</span>
            <span className="live-wire-stat" title="outreach + documents sent">↑ {outCount}</span>
            <span className="live-wire-stat" title="AI calls">AI {counters.ai ?? 0}</span>
            <span className="live-wire-stat" title="webhooks">HOOK {counters.webhook ?? 0}</span>
            {!compact ? (
              <>
                {(["all", "outreach", "ai", "ops"] as const).map((f) => (
                  <button key={f} type="button" className={cn("live-wire-filter", filter === f && "live-wire-filter-on")} onClick={() => setFilter(f)}>
                    {f}
                  </button>
                ))}
                <button type="button" className="live-wire-filter" onClick={() => setPaused((p) => !p)}>
                  {paused ? "resume" : "pause"}
                </button>
              </>
            ) : (
              <Link href="/admin/live" className="live-wire-filter live-wire-filter-on">
                expand
              </Link>
            )}
          </div>
        </header>
      ) : null}
      <ol ref={listRef} className="live-wire-list">
        {visible.length ? (
          visible.map((e) => {
            const href = refHref(e.refs);
            return (
              <li key={e.id} className={cn("live-wire-row", `live-kind-${e.kind}`)}>
                <span className="live-wire-time">{fmtTime(e.at)}</span>
                <span className={cn("live-wire-kind", levelClass(e.level))}>{KIND_LABEL[e.kind] ?? e.kind}</span>
                <span className="live-wire-text">
                  {href ? (
                    <Link href={href} className="hover:underline">
                      {e.title}
                    </Link>
                  ) : (
                    e.title
                  )}
                  {e.detail ? <span className="live-wire-detail"> — {e.detail}</span> : null}
                </span>
              </li>
            );
          })
        ) : (
          <li className="live-wire-row text-stone-500">
            <span className="live-wire-time">--:--:--</span>
            <span className="live-wire-kind">SYS</span>
            <span className="live-wire-text">waiting for activity… the engine ticks every few minutes; run one from the Automation hub to see it move.</span>
          </li>
        )}
      </ol>
    </section>
  );
}
