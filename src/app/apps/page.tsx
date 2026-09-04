"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppsShell } from "@/components/AppsShell";
import { MetricStrip, PageFrame, Panel } from "@/components/cc";
import { loadAppData } from "@/lib/client-data";
import { buildFieldTodayMetrics } from "@/lib/ops-wall";
import { useSession } from "@/lib/session";
import type { AppData } from "@/lib/types";

const apps = [
  {
    href: "/apps/schedule",
    title: "Schedule",
    blurb: "Your shifts plus open pool and overtime to claim.",
    perm: "schedule" as const,
  },
  {
    href: "/apps/board",
    title: "Announcements",
    blurb: "Company messages and role-targeted posts.",
    perm: "board" as const,
  },
  {
    href: "/apps/progress",
    title: "Job progress",
    blurb: "Photos, notes, and AI summarize for the job report.",
    perm: "progress" as const,
  },
  {
    href: "/apps/tools",
    title: "Tools in/out",
    blurb: "Check yard tools out to yourself and jobs.",
    perm: "tools" as const,
  },
  {
    href: "/apps/damage",
    title: "Damage report",
    blurb: "Log tool/site damage with photos.",
    perm: "damage" as const,
  },
  {
    href: "/apps/knocker",
    title: "Knocker",
    blurb: "Active Knocker — map turfs, GPS pins, routes, team chat.",
    perm: "knocker" as const,
  },
  {
    href: "/apps/clock",
    title: "Time clock",
    blurb: "Clock in/out against jobs from any phone.",
    perm: "clock" as const,
  },
  {
    href: "/admin/jobs",
    title: "Jobs",
    blurb: "Active and scheduled job board.",
    perm: "jobs" as const,
  },
  {
    href: "/admin/inventory",
    title: "Inventory",
    blurb: "Stock levels and issue/receive.",
    perm: "inventory" as const,
  },
  {
    href: "/admin/invoices",
    title: "Invoices",
    blurb: "Invoice or full job report with progress.",
    perm: "invoices" as const,
  },
  {
    href: "/admin/hours",
    title: "Hours",
    blurb: "Your crew time and payroll view.",
    perm: "hours" as const,
  },
  {
    href: "/admin/fleet",
    title: "Fleet",
    blurb: "Vehicle status and assignments.",
    perm: "fleet" as const,
  },
  {
    href: "/admin/fuel",
    title: "Fuel & travel",
    blurb: "Log fills and track spend.",
    perm: "fuel" as const,
  },
  {
    href: "/admin/dashboard",
    title: "Ops wall",
    blurb: "Full command center — if your role allows.",
    perm: "dashboard" as const,
  },
];

export default function AppsHubPage() {
  const { can, user } = useSession();
  const [data, setData] = useState<AppData | null>(null);
  const visible = apps.filter((app) => can(app.perm));

  useEffect(() => {
    loadAppData().then(setData);
  }, []);

  const metrics = data
    ? buildFieldTodayMetrics(data, user?.id)
    : [
        { label: "Status", value: "…" },
        { label: "My knocks", value: "…" },
        { label: "My zones", value: "…" },
        { label: "Active jobs", value: "…" },
      ];

  return (
    <AppsShell title="Home">
      <PageFrame
        context="Field mode"
        title="Today"
        subtitle="Same command center language as ops — tools filtered to your role."
      >
        <MetricStrip items={metrics} />

        <Panel title="Your tools">
          <div className="cc-hub-grid">
            {visible.map((app) => (
              <Link key={app.href} href={app.href} className="cc-hub-card">
                <h2>{app.title}</h2>
                <p>{app.blurb}</p>
              </Link>
            ))}
          </div>
        </Panel>
      </PageFrame>
    </AppsShell>
  );
}
