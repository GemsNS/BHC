"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
    if (insights.length <= 1) return;
    const rotate = window.setInterval(() => {
      setIndex((n) => (n + 1) % insights.length);
    }, 8000);
    return () => window.clearInterval(rotate);
  }, [insights.length]);

  const dots = useMemo(
    () => insights.map((_, i) => i === index % insights.length),
    [insights, index],
  );

  return (
    <div className="jarvis-bar" role="status" aria-live="polite">
      <div className="jarvis-bar-inner">
        <div className="jarvis-orb" aria-hidden />
        <div className="jarvis-bar-copy">
          <p className="jarvis-bar-label">BHC Intelligence</p>
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
          <div className="jarvis-dots" aria-hidden>
            {dots.map((on, i) => (
              <span key={i} className={cn("jarvis-dot", on && "jarvis-dot-on")} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
