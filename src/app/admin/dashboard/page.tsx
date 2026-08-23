"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ActivityFeed,
  AlertRail,
  MetricStrip,
  PageFrame,
  Panel,
} from "@/components/cc";
import { loadAppData } from "@/lib/client-data";
import {
  buildActivityFeed,
  buildOpsAlerts,
  buildOpsMetrics,
} from "@/lib/ops-wall";
import type { AppData } from "@/lib/types";

export default function DashboardPage() {
  const [data, setData] = useState<AppData | null>(null);

  useEffect(() => {
    loadAppData().then(setData);
  }, []);

  if (!data) {
    return <p className="cc-empty">Loading ops wall…</p>;
  }

  const metrics = buildOpsMetrics(data);
  const feed = buildActivityFeed(data);
  const alerts = buildOpsAlerts(data);
  const pinned = data.announcements
    .filter((a) => a.pinned)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <PageFrame
      context="Intelligence layer"
      title="Live overview"
      subtitle="Cross-system pulse — sales, crew, shifts, and spend in one place."
      actions={
        <div className="cc-quick-links">
          <Link href="/admin/sales" className="cc-quick-link">
            Sales
          </Link>
          <Link href="/admin/schedule" className="cc-quick-link">
            Schedule
          </Link>
          <Link href="/admin/jobs" className="cc-quick-link">
            Jobs
          </Link>
          <Link href="/apps/knocker" className="cc-quick-link">
            Knocker
          </Link>
        </div>
      }
    >
      <MetricStrip items={metrics} />

      <div className="cc-ops-grid">
        <Panel title="Activity feed">
          <ActivityFeed items={feed} />
        </Panel>

        <div className="grid gap-4">
          <Panel title="Alerts" pulse={alerts.some((a) => a.level === "critical")}>
            <AlertRail
              items={alerts}
              linkAs={(href, children) => (
                <Link href={href} className="block">
                  {children}
                </Link>
              )}
            />
          </Panel>

          <Panel
            title="Pinned announcements"
            action={
              <Link href="/admin/board" className="cc-topbar-link">
                Open board
              </Link>
            }
          >
            {pinned.length ? (
              <ul className="cc-pin-list">
                {pinned.map((a) => (
                  <li key={a.id} className="cc-pin-item">
                    <h3>{a.title}</h3>
                    <p>{a.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cc-empty">No pinned posts.</p>
            )}
          </Panel>
        </div>
      </div>
    </PageFrame>
  );
}
