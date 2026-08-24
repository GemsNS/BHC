"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { loadAppData } from "@/lib/client-data";
import {
  buildJarvisInsights,
  buildJarvisSnapshot,
  jarvisContextFromPath,
  JARVIS_CATEGORY_LABELS,
  type JarvisInsight,
  type JarvisMetricChip,
  type JarvisTone,
} from "@/lib/jarvis-briefing";
import { cn } from "@/lib/utils";
import { JarvisDetailPanel } from "./JarvisDetailPanel";

const TONE_CLASS: Record<JarvisTone, string> = {
  neutral: "jarvis-tone-neutral",
  action: "jarvis-tone-action",
  success: "jarvis-tone-success",
  warn: "jarvis-tone-warn",
};

function refreshData(
  context: ReturnType<typeof jarvisContextFromPath>,
  setInsights: (v: JarvisInsight[]) => void,
  setMetrics: (v: JarvisMetricChip[]) => void,
) {
  loadAppData().then((data) => {
    const built = buildJarvisInsights(data, context);
    const snapshot = buildJarvisSnapshot(data, context);
    snapshot.insightCount = built.length;
    setInsights(built);
    setMetrics(snapshot.metrics);
  });
}

export function JarvisBar({
  variant = "default",
}: {
  variant?: "default" | "hud";
}) {
  const pathname = usePathname();
  const [insights, setInsights] = useState<JarvisInsight[]>([]);
  const [metrics, setMetrics] = useState<JarvisMetricChip[]>([]);
  const [index, setIndex] = useState(0);
  const [typing, setTyping] = useState("");
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isHud = variant === "hud";
  const context = jarvisContextFromPath(pathname);

  useEffect(() => {
    refreshData(context, setInsights, setMetrics);
    setIndex(0);
    setExpanded(false);
  }, [pathname, context]);

  useEffect(() => {
    const onFocus = () => refreshData(context, setInsights, setMetrics);
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(onFocus, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [context]);

  const active = insights[index % Math.max(insights.length, 1)];

  useEffect(() => {
    if (!active || expanded || isHud) {
      setTyping(active?.text ?? "");
      return;
    }
    setTyping("");
    let i = 0;
    const text = active.text;
    const timer = window.setInterval(() => {
      i += 1;
      setTyping(text.slice(0, i));
      if (i >= text.length) window.clearInterval(timer);
    }, 14);
    return () => window.clearInterval(timer);
  }, [active, expanded, isHud]);

  useEffect(() => {
    if (insights.length <= 1 || paused || expanded) return;
    const rotate = window.setInterval(() => {
      setIndex((n) => (n + 1) % insights.length);
    }, 10_000);
    return () => window.clearInterval(rotate);
  }, [insights.length, paused, expanded]);

  const dots = useMemo(
    () => insights.map((_, i) => i === index % insights.length),
    [insights, index],
  );

  const cycle = useCallback(
    (dir: 1 | -1) => {
      if (insights.length <= 1) return;
      setIndex((n) => (n + dir + insights.length) % insights.length);
    },
    [insights.length],
  );

  const primaryHref =
    active?.primaryAction?.href ?? active?.href;

  function selectInsight(i: number) {
    setIndex(i);
    setExpanded(true);
  }

  function toggleExpanded() {
    setExpanded((open) => !open);
  }

  if (!active) return null;

  return (
    <div className={cn("jarvis-stack", isHud && "jarvis-stack-hud")}>
      {metrics.length > 0 ? (
        <div className="jarvis-metrics" role="list" aria-label="Live metrics">
          {metrics.map((chip) => {
            const inner = (
              <>
                <span className="jarvis-metric-value">{chip.value}</span>
                <span className="jarvis-metric-label">{chip.label}</span>
              </>
            );
            return chip.href ? (
              <Link
                key={chip.id}
                href={chip.href}
                className={cn("jarvis-metric-chip", chip.tone && TONE_CLASS[chip.tone])}
                role="listitem"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={chip.id}
                className={cn("jarvis-metric-chip", chip.tone && TONE_CLASS[chip.tone])}
                role="listitem"
              >
                {inner}
              </div>
            );
          })}
        </div>
      ) : null}

      <div
        className={cn(
          "jarvis-bar",
          expanded && "jarvis-bar-expanded",
          TONE_CLASS[active.tone],
        )}
        role="region"
        aria-label="BH Intelligence"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="jarvis-bar-inner">
          <button
            type="button"
            className="jarvis-orb jarvis-orb-btn"
            aria-label="Next briefing"
            onClick={() => cycle(1)}
          />

          <button
            type="button"
            className="jarvis-bar-main"
            aria-expanded={expanded}
            onClick={toggleExpanded}
          >
            <div className="jarvis-bar-copy">
              <div className="jarvis-bar-meta">
                <span className={cn("jarvis-category-chip", TONE_CLASS[active.tone])}>
                  {JARVIS_CATEGORY_LABELS[active.category]}
                </span>
                <p className="jarvis-bar-label">BH Intelligence</p>
              </div>
              <p className="jarvis-bar-text">
                {expanded ? active.text : typing}
                {!expanded && typing.length < active.text.length ? (
                  <span className="jarvis-cursor" aria-hidden />
                ) : null}
              </p>
            </div>
            <span
              className={cn("jarvis-chevron", expanded && "jarvis-chevron-open")}
              aria-hidden
            />
          </button>

          {primaryHref && !expanded ? (
            <Link href={primaryHref} className="jarvis-bar-action">
              {active.primaryAction?.label ?? "Open"}
            </Link>
          ) : null}

          {insights.length > 1 ? (
            <div className="jarvis-dots" role="tablist" aria-label="Briefings">
              {dots.map((on, i) => (
                <button
                  key={insights[i]?.id ?? i}
                  type="button"
                  className={cn("jarvis-dot", on && "jarvis-dot-on")}
                  aria-label={`${insights[i]?.title ?? "Briefing"} ${i + 1}`}
                  aria-current={on ? "true" : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectInsight(i);
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <JarvisDetailPanel insight={active} onClose={() => setExpanded(false)} />
      ) : null}
    </div>
  );
}
