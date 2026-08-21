"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { loadAppData } from "@/lib/client-data";
import type { AppData } from "@/lib/types";

export default function FleetPage() {
  const [data, setData] = useState<AppData | null>(null);
  useEffect(() => {
    loadAppData().then(setData);
  }, []);
  if (!data) return <p className="text-[var(--muted)]">Loading fleet…</p>;
  const byId = Object.fromEntries(data.employees.map((e) => [e.id, e]));

  return (
    <div>
      <PageHeader
        title="Fleet"
        subtitle="Vehicle board for trucks, vans, and trailers. Pair with Fuel for cost tracking."
        actions={
          <Link
            href="/admin/fuel"
            className="rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm"
          >
            Fuel logs
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {data.vehicles.map((vehicle) => (
          <article
            key={vehicle.id}
            className="rounded-xl border border-[var(--line)] bg-white p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-2xl">
                  {vehicle.name}
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  {vehicle.plate} · {vehicle.type}
                </p>
              </div>
              <StatusBadge status={vehicle.status} />
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted)]">Driver</dt>
                <dd>
                  {vehicle.driverId
                    ? byId[vehicle.driverId]?.name ?? "Unknown"
                    : "Unassigned"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted)]">Odometer</dt>
                <dd>{vehicle.odometer.toLocaleString()} mi</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted)]">Last ping</dt>
                <dd>{new Date(vehicle.lastUpdate).toLocaleString()}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted)]">Coords</dt>
                <dd className="font-mono text-xs">
                  {vehicle.lat.toFixed(4)}, {vehicle.lng.toFixed(4)}
                </dd>
              </div>
            </dl>
            <div className="mt-4 h-28 rounded-lg bg-[linear-gradient(135deg,#1f4e5f,#243039)] p-3 text-xs text-white/80">
              Map placeholder
              <p className="mt-8 font-mono text-[10px] text-white/50">
                {vehicle.lat}, {vehicle.lng}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
