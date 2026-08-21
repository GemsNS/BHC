"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import {
  clientNewId,
  clientNowIso,
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { Employee, KnockEvent, KnockZone } from "@/lib/types";
import { useSession } from "@/lib/session";

export default function ZonesAdminPage() {
  const { can } = useSession();
  const [zones, setZones] = useState<KnockZone[]>([]);
  const [knocks, setKnocks] = useState<KnockEvent[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (isStaticDemo()) {
      const data = await loadAppData();
      setZones(data.zones);
      setKnocks(data.knocks);
      setEmployees(data.employees);
      return;
    }
    try {
      const json = await fetchJson<{
        zones: KnockZone[];
        knocks: KnockEvent[];
        employees: Employee[];
      }>("/api/zones");
      setZones(json.zones);
      setKnocks(json.knocks);
      setEmployees(json.employees);
    } catch {
      const data = await loadAppData();
      setZones(data.zones);
      setKnocks(data.knocks);
      setEmployees(data.employees);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const knockers = employees.filter(
    (e) =>
      e.active &&
      (e.role === "knocker" ||
        e.role === "sales" ||
        e.role === "admin" ||
        e.role === "manager"),
  );

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!can("manage_zones")) {
      setMessage("You do not have permission to manage zones.");
      return;
    }
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const assigned = form.getAll("assignees").map(String);
    const payload = {
      name: String(form.get("name") || ""),
      neighborhood: String(form.get("neighborhood") || ""),
      city: String(form.get("city") || ""),
      description: String(form.get("description") || ""),
      targetDoors: Number(form.get("targetDoors") || 50),
      assignedKnockerIds: assigned,
      status: "open" as const,
    };

    if (isStaticDemo()) {
      await mutateAppData((data) => {
        data.zones.unshift({
          id: clientNewId(),
          ...payload,
          centerLat: 36.974,
          centerLng: -122.03,
          createdAt: clientNowIso(),
        });
      });
    } else {
      await fetchJson("/api/zones", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    formEl.reset();
    setMessage("Zone created.");
    await refresh();
  }

  async function updateZone(
    id: string,
    patch: Partial<KnockZone> & { assignedKnockerIds?: string[] },
  ) {
    if (!can("manage_zones")) return;
    if (isStaticDemo()) {
      await mutateAppData((data) => {
        const z = data.zones.find((x) => x.id === id);
        if (!z) return;
        Object.assign(z, patch);
      });
    } else {
      await fetchJson("/api/zones", {
        method: "PATCH",
        body: JSON.stringify({ id, ...patch }),
      });
    }
    await refresh();
  }

  return (
    <div>
      <PageHeader
        title="Knocker zones"
        subtitle="Assign neighborhoods to knockers. Every door they log shows up here in real time."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Zones" value={zones.length} />
        <StatCard label="Total knocks" value={knocks.length} />
        <StatCard
          label="Active zones"
          value={zones.filter((z) => z.status === "active").length}
        />
      </div>

      {can("manage_zones") ? (
        <form
          onSubmit={onCreate}
          className="mb-8 grid gap-3 rounded-xl border border-[var(--line)] bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <h2 className="font-[family-name:var(--font-display)] text-2xl sm:col-span-2 lg:col-span-3">
            Create zone
          </h2>
          <input name="name" required placeholder="Zone name" className="rounded-md border border-[var(--line)] px-3 py-2" />
          <input name="neighborhood" required placeholder="Neighborhood" className="rounded-md border border-[var(--line)] px-3 py-2" />
          <input name="city" required placeholder="City" className="rounded-md border border-[var(--line)] px-3 py-2" />
          <input name="targetDoors" type="number" min={1} defaultValue={50} placeholder="Target doors" className="rounded-md border border-[var(--line)] px-3 py-2" />
          <input name="description" placeholder="Description" className="rounded-md border border-[var(--line)] px-3 py-2 sm:col-span-2" />
          <fieldset className="sm:col-span-2 lg:col-span-3">
            <legend className="mb-2 text-sm text-[var(--muted)]">Assign knockers</legend>
            <div className="flex flex-wrap gap-3">
              {knockers.map((k) => (
                <label key={k.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="assignees" value={k.id} />
                  {k.name}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="rounded-md bg-[var(--amber)] px-4 py-2 font-semibold text-[var(--ink)]">
            Create zone
          </button>
          {message ? <p className="text-sm text-emerald-800 sm:col-span-2">{message}</p> : null}
        </form>
      ) : (
        <p className="mb-6 text-sm text-[var(--muted)]">View-only — ask a manager to assign zones.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {zones.map((zone) => {
          const count = knocks.filter((k) => k.zoneId === zone.id).length;
          const pct = zone.targetDoors
            ? Math.min(100, Math.round((count / zone.targetDoors) * 100))
            : 0;
          const recent = knocks
            .filter((k) => k.zoneId === zone.id)
            .slice(0, 5);
          return (
            <article
              key={zone.id}
              className="rounded-xl border border-[var(--line)] bg-white p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-2xl">
                    {zone.name}
                  </h3>
                  <p className="text-sm text-[var(--muted)]">
                    {zone.neighborhood}, {zone.city}
                  </p>
                </div>
                <StatusBadge status={zone.status} />
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{zone.description}</p>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-[var(--muted)]">
                  <span>
                    {count} / {zone.targetDoors} doors
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--line)]">
                  <div
                    className="h-full bg-[var(--amber)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <select
                  className="rounded-md border border-[var(--line)] px-2 py-1 text-sm"
                  value={zone.status}
                  disabled={!can("manage_zones")}
                  onChange={(e) =>
                    updateZone(zone.id, {
                      status: e.target.value as KnockZone["status"],
                    })
                  }
                >
                  {["open", "active", "paused", "completed"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  multiple
                  className="min-w-[12rem] rounded-md border border-[var(--line)] px-2 py-1 text-sm"
                  disabled={!can("manage_zones")}
                  value={zone.assignedKnockerIds}
                  onChange={(e) => {
                    const ids = Array.from(e.target.selectedOptions).map(
                      (o) => o.value,
                    );
                    updateZone(zone.id, { assignedKnockerIds: ids });
                  }}
                >
                  {knockers.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>
              <ul className="mt-4 divide-y divide-[var(--line)] text-sm">
                {recent.map((k) => (
                  <li key={k.id} className="flex justify-between gap-2 py-2">
                    <span>{k.address}</span>
                    <StatusBadge status={k.outcome} />
                  </li>
                ))}
                {recent.length === 0 ? (
                  <li className="py-2 text-[var(--muted)]">No knocks yet</li>
                ) : null}
              </ul>
            </article>
          );
        })}
      </div>
    </div>
  );
}
