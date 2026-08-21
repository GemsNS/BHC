"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { fetchJson, loadAppData } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { AppData, KnockEvent, SalesProjection } from "@/lib/types";
import { formatCurrency, labelize } from "@/lib/utils";

type StatsPayload = {
  stats: Record<string, number>;
  knocksByOutcome: Record<string, number>;
  zoneProgress: Array<{
    zoneId: string;
    name: string;
    status: string;
    knocks: number;
    target: number;
    pct: number;
    assignees: number;
  }>;
  projection: SalesProjection | null;
  recentKnocks: KnockEvent[];
};

function computeFromData(data: AppData): StatsPayload {
  const materialSpend = data.materials.reduce(
    (s, m) => s + m.quantity * m.unitCost,
    0,
  );
  const fuelSpend = data.fuelLogs.reduce((s, f) => s + f.cost, 0);
  const knocksByOutcome = data.knocks.reduce<Record<string, number>>((acc, k) => {
    acc[k.outcome] = (acc[k.outcome] || 0) + 1;
    return acc;
  }, {});
  return {
    stats: {
      openLeads: data.leads.filter((l) => !["won", "lost"].includes(l.status))
        .length,
      activeJobs: data.jobs.filter((j) =>
        ["scheduled", "in_progress", "on_hold"].includes(j.status),
      ).length,
      contractValue: data.jobs.reduce((s, j) => s + (j.contractValue || 0), 0),
      materialSpend,
      fuelSpend,
      fuelGallons: data.fuelLogs.reduce((s, f) => s + f.gallons, 0),
      knocksTotal: data.knocks.length,
      knocksToday: data.knocks.filter(
        (k) =>
          new Date(k.createdAt).toDateString() === new Date().toDateString(),
      ).length,
      zonesActive: data.zones.filter((z) => z.status === "active").length,
      teamSize: data.employees.filter((e) => e.active).length,
    },
    knocksByOutcome,
    zoneProgress: data.zones.map((z) => {
      const knocks = data.knocks.filter((k) => k.zoneId === z.id).length;
      return {
        zoneId: z.id,
        name: z.name,
        status: z.status,
        knocks,
        target: z.targetDoors,
        pct: z.targetDoors
          ? Math.min(100, Math.round((knocks / z.targetDoors) * 100))
          : 0,
        assignees: z.assignedKnockerIds.length,
      };
    }),
    projection: data.projections[0] || null,
    recentKnocks: data.knocks.slice(0, 10),
  };
}

export default function StatsPage() {
  const [data, setData] = useState<StatsPayload | null>(null);

  useEffect(() => {
    (async () => {
      if (isStaticDemo()) {
        setData(computeFromData(await loadAppData()));
        return;
      }
      try {
        setData(await fetchJson<StatsPayload>("/api/stats"));
      } catch {
        setData(computeFromData(await loadAppData()));
      }
    })();
  }, []);

  if (!data) {
    return <p className="text-[var(--muted)]">Loading statistics…</p>;
  }

  const { stats, knocksByOutcome, zoneProgress, projection, recentKnocks } =
    data;

  return (
    <div>
      <PageHeader
        title="Statistics"
        subtitle="Sales projections, knock conversion, job value, materials, and fuel at a glance."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Contract value" value={formatCurrency(stats.contractValue || 0)} />
        <StatCard label="Material spend" value={formatCurrency(stats.materialSpend || 0)} />
        <StatCard label="Fuel spend" value={formatCurrency(stats.fuelSpend || 0)} />
        <StatCard label="Open leads" value={stats.openLeads || 0} />
        <StatCard label="Active jobs" value={stats.activeJobs || 0} />
        <StatCard label="Knocks (total)" value={stats.knocksTotal || 0} />
        <StatCard label="Knocks today" value={stats.knocksToday || 0} />
        <StatCard label="Active zones" value={stats.zonesActive || 0} />
      </div>

      {projection ? (
        <section className="mt-6 rounded-xl border border-[var(--line)] bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            Sales projection — {projection.month}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Projected revenue"
              value={formatCurrency(projection.projectedRevenue)}
            />
            <StatCard label="Projected jobs" value={projection.projectedJobs} />
            <StatCard label="Projected knocks" value={projection.projectedKnocks} />
          </div>
          {projection.notes ? (
            <p className="mt-3 text-sm text-[var(--muted)]">{projection.notes}</p>
          ) : null}
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--line)] bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            Knock outcomes
          </h2>
          <ul className="mt-3 space-y-2">
            {Object.entries(knocksByOutcome).map(([outcome, count]) => (
              <li
                key={outcome}
                className="flex items-center justify-between text-sm"
              >
                <span>{labelize(outcome)}</span>
                <span className="font-semibold">{count}</span>
              </li>
            ))}
            {Object.keys(knocksByOutcome).length === 0 ? (
              <li className="text-sm text-[var(--muted)]">No knocks yet</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            Zone progress
          </h2>
          <ul className="mt-3 space-y-3">
            {zoneProgress.map((z) => (
              <li key={z.zoneId}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{z.name}</span>
                  <StatusBadge status={z.status} />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--line)]">
                  <div
                    className="h-full bg-[var(--sea)]"
                    style={{ width: `${z.pct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {z.knocks}/{z.target} doors · {z.assignees} assigned
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-[var(--line)] bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          Recent knocks
        </h2>
        <ul className="mt-3 divide-y divide-[var(--line)]">
          {recentKnocks.map((k) => (
            <li
              key={k.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
            >
              <span className="font-medium">{k.address}</span>
              <StatusBadge status={k.outcome} />
              <span className="text-xs text-[var(--muted)]">
                {new Date(k.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
