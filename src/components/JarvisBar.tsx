"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { loadAppData } from "@/lib/client-data";
import {
  buildJarvisInsights,
  jarvisContextFromPath,
  type JarvisInsight,
} from "@/lib/jarvis-briefing";
import { cn } from "@/lib/utils";

export function JarvisBar() {
  const pathname = usePathname();
  const [insights, setInsights] = useState<JarvisInsight[]>([]);
  const [index, setIndex] = useState(0);
  const [typing, setTyping] = useState("");
  const [paused, setPaused] = useState(false);

  const context = jarvisContextFromPath(pathname);

  useEffect(() => {
    loadAppData().then((data) => {
      setInsights(buildJarvisInsights(data, context));
      setIndex(0);
    });
  }, [pathname, context]);

  const active = insights[index % Math.max(insights.length, 1)];

  useEffect(() => {
    if (!active) return;
    setTyping("");
    let i = 0;
    const text = active.text;
    const timer = window.setInterval(() => {
      i += 1;
      setTyping(text.slice(0, i));
      if (i >= text.length) window.clearInterval(timer);
    }, 12);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (insights.length <= 1 || paused) return;
    const rotate = window.setInterval(() => {
      setIndex((n) => (n + 1) % insights.length);
    }, 8000);
    return () => window.clearInterval(rotate);
  }, [insights.length, paused]);

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

  return (
    <div
      className="jarvis-bar jarvis-bar-interactive"
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="jarvis-bar-inner">
        <button
          type="button"
          className="jarvis-orb jarvis-orb-btn"
          aria-label="Next intelligence brief"
          onClick={() => cycle(1)}
        />
        <div className="jarvis-bar-copy">
          <p className="jarvis-bar-label">BH Intelligence</p>
          <p className="jarvis-bar-text">
            {typing}
            <span className="jarvis-cursor" aria-hidden />
          </p>
        </div>
        {active?.href ? (
          <Link href={active.href} className="jarvis-bar-action">
            Open
          </Link>
        ) : null}
        {insights.length > 1 ? (
          <div className="jarvis-dots" role="tablist" aria-label="Briefings">
            {dots.map((on, i) => (
              <button
                key={i}
                type="button"
                className={cn("jarvis-dot", on && "jarvis-dot-on")}
                aria-label={`Briefing ${i + 1}`}
                aria-current={on ? "true" : undefined}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
