"use client";

import Link from "next/link";
import { AppsShell } from "@/components/AppsShell";
import { useSession } from "@/lib/session";

const apps = [
  {
    href: "/apps/board",
    title: "Announcements",
    blurb: "Company messages and role-targeted posts.",
    perm: "board" as const,
  },
  {
    href: "/apps/knocker",
    title: "Knocker",
    blurb: "Zone-assigned door knocking. Logs sync to admin.",
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
    title: "Fuel",
    blurb: "Log fills and track spend.",
    perm: "fuel" as const,
  },
  {
    href: "/admin/dashboard",
    title: "Admin desk",
    blurb: "Full ops panel — only if your role allows.",
    perm: "dashboard" as const,
  },
];

export default function AppsHubPage() {
  const { can } = useSession();
  const visible = apps.filter((app) => can(app.perm));

  return (
    <AppsShell title="Home">
      <div className="apps-hub">
        <p className="apps-hub-lead">
          Tools for your role. Phones use bottom tabs; desktop uses the top nav
          and wider layout.
        </p>
        <div className="apps-hub-grid">
          {visible.map((app) => (
            <Link key={app.href} href={app.href} className="apps-hub-card">
              <h2>{app.title}</h2>
              <p>{app.blurb}</p>
            </Link>
          ))}
        </div>
      </div>
    </AppsShell>
  );
}
