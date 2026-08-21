"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { loadAppData } from "@/lib/client-data";
import type { AppData } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export default function DashboardPage() {
  const [data, setData] = useState<AppData | null>(null);

  useEffect(() => {
    loadAppData().then(setData);
  }, []);

  if (!data) {
    return <p className="text-[var(--muted)]">Loading dashboard…</p>;
  }

  const openLeads = data.leads.filter((l) => !["won", "lost"].includes(l.status));
  const activeJobs = data.jobs.filter((j) =>
    ["scheduled", "in_progress", "on_hold"].includes(j.status),
  );
  const clockedIn = data.timeEntries.filter((t) => t.clockOut === null);
  const materialSpend = data.materials.reduce(
    (s, m) => s + m.quantity * m.unitCost,
    0,
  );
  const knocksToday = data.knocks.filter(
    (k) => new Date(k.createdAt).toDateString() === new Date().toDateString(),
  ).length;
  const contractValue = data.jobs.reduce(
    (s, j) => s + (j.contractValue || j.estimatedValue || 0),
    0,
  );

  return (
    <div>
      <PageHeader
        title="Operations dashboard"
        subtitle="Subcontracting pulse — jobs, knocker zones, materials, fuel, and crew."
        actions={
          <>
            <Link
              href="/admin/zones"
              className="rounded-md bg-[var(--amber)] px-3 py-2 text-sm font-semibold text-[var(--ink)]"
            >
              Knocker zones
            </Link>
            <Link
              href="/apps"
              className="rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm"
            >
              Field apps
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open leads" value={openLeads.length} />
        <StatCard label="Active jobs" value={activeJobs.length} />
        <StatCard label="Contract value" value={formatCurrency(contractValue)} />
        <StatCard label="Material spend" value={formatCurrency(materialSpend)} />
        <StatCard label="Knocks today" value={knocksToday} />
        <StatCard
          label="Active zones"
          value={data.zones.filter((z) => z.status === "active").length}
        />
        <StatCard label="Clocked in" value={clockedIn.length} />
        <StatCard
          label="Fuel spend"
          value={formatCurrency(data.fuelLogs.reduce((s, f) => s + f.cost, 0))}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--line)] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-2xl">
              Zone progress
            </h2>
            <Link href="/admin/zones" className="text-sm text-[var(--sea)]">
              Manage
            </Link>
          </div>
          <ul className="space-y-3">
            {data.zones.slice(0, 5).map((z) => {
              const count = data.knocks.filter((k) => k.zoneId === z.id).length;
              const pct = z.targetDoors
                ? Math.min(100, Math.round((count / z.targetDoors) * 100))
                : 0;
              return (
                <li key={z.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium">{z.name}</span>
                    <StatusBadge status={z.status} />
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--line)]">
                    <div className="h-full bg-[var(--amber)]" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {count}/{z.targetDoors} doors
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-2xl">
              Recent knocks
            </h2>
            <Link href="/apps/knocker" className="text-sm text-[var(--sea)]">
              Open knocker
            </Link>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {data.knocks.slice(0, 6).map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{k.address}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {new Date(k.createdAt).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={k.outcome} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
