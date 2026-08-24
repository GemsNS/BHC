"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ActivityFeed,
  AlertRail,
  MetricStrip,
  PageFrame,
  Panel,
} from "@/components/cc";
import { RadialHud } from "@/components/command-deck/RadialHud";
import { CommandCanvas } from "@/components/command-deck/CommandCanvas";
import { JarvisBar } from "@/components/JarvisBar";
import { loadAppData } from "@/lib/client-data";
import type { DeckView } from "@/lib/command-deck";
import type { AppData } from "@/lib/types";
import {
  buildActivityFeed,
  buildOpsAlerts,
  buildOpsMetrics,
} from "@/lib/ops-wall";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const classic = searchParams.get("classic") === "1";
  const [data, setData] = useState<AppData | null>(null);
  const [view, setView] = useState<DeckView>("sales");

  useEffect(() => {
    loadAppData().then(setData);
  }, []);

  if (!data) {
    return <p className="hud-loading">Initializing command deck…</p>;
  }

  if (classic) {
    const metrics = buildOpsMetrics(data);
    const feed = buildActivityFeed(data);
    const alerts = buildOpsAlerts(data);
    return (
      <div className="command-deck-classic-wrap">
        <p className="mb-4 text-sm text-[var(--muted)]">
          <Link href="/admin/dashboard" className="linkish">
            ← HUD command deck
          </Link>
        </p>
        <PageFrame title="Live overview" subtitle="Classic list view" context="Intelligence layer">
          <MetricStrip items={metrics} />
          <div className="cc-ops-grid">
            <Panel title="Activity feed">
              <ActivityFeed items={feed} />
            </Panel>
            <Panel title="Alerts">
              <AlertRail
                items={alerts}
                linkAs={(href, children) => (
                  <Link href={href} className="block">
                    {children}
                  </Link>
                )}
              />
            </Panel>
          </div>
        </PageFrame>
      </div>
    );
  }

  return (
    <div className="command-deck">
      <div className="command-deck-vignette" aria-hidden />
      <div className="command-deck-glow" aria-hidden />
      <header className="command-deck-header">
        <p className="command-deck-eyebrow">BHC INTELLIGENCE</p>
        <h1 className="command-deck-title">{view.toUpperCase()}</h1>
        <Link href="/admin/dashboard?classic=1" className="command-deck-classic-link">
          Classic view
        </Link>
      </header>
      <CommandCanvas view={view} data={data} />
      <JarvisBar variant="hud" />
      <RadialHud active={view} onChange={setView} />
    </div>
  );
}
