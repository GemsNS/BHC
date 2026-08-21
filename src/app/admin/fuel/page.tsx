"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import {
  clientNewId,
  clientNowIso,
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { Employee, FuelLog, Vehicle } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export default function FuelPage() {
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  async function refresh() {
    if (isStaticDemo()) {
      const data = await loadAppData();
      setFuelLogs(data.fuelLogs);
      setVehicles(data.vehicles);
      setEmployees(data.employees);
      return;
    }
    try {
      const json = await fetchJson<{
        fuelLogs: FuelLog[];
        vehicles: Vehicle[];
        employees: Employee[];
      }>("/api/fuel");
      setFuelLogs(json.fuelLogs);
      setVehicles(json.vehicles);
      setEmployees(json.employees);
    } catch {
      const data = await loadAppData();
      setFuelLogs(data.fuelLogs);
      setVehicles(data.vehicles);
      setEmployees(data.employees);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const spend = fuelLogs.reduce((s, f) => s + f.cost, 0);
  const gallons = fuelLogs.reduce((s, f) => s + f.gallons, 0);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      vehicleId: String(form.get("vehicleId") || ""),
      employeeId: String(form.get("employeeId") || ""),
      gallons: Number(form.get("gallons") || 0),
      cost: Number(form.get("cost") || 0),
      odometer: Number(form.get("odometer") || 0),
      station: String(form.get("station") || ""),
      notes: String(form.get("notes") || ""),
    };
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        const filledAt = clientNowIso();
        d.fuelLogs.unshift({ id: clientNewId(), ...payload, filledAt });
        const v = d.vehicles.find((x) => x.id === payload.vehicleId);
        if (v) {
          v.odometer = Math.max(v.odometer, payload.odometer);
          v.lastUpdate = filledAt;
        }
      });
    } else {
      await fetchJson("/api/fuel", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    formEl.reset();
    await refresh();
  }

  return (
    <div>
      <PageHeader
        title="Fuel tracking"
        subtitle="Log fills by vehicle for fleet cost control."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Fuel spend" value={formatCurrency(spend)} />
        <StatCard label="Gallons" value={gallons.toFixed(1)} />
        <StatCard
          label="$ / gal"
          value={gallons ? formatCurrency(spend / gallons) : "—"}
        />
      </div>
      <form
        onSubmit={onCreate}
        className="mb-8 grid gap-3 rounded-xl border border-[var(--line)] bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        <h2 className="font-[family-name:var(--font-display)] text-2xl sm:col-span-2 lg:col-span-3">
          Log fuel fill
        </h2>
        <select name="vehicleId" required className="rounded-md border border-[var(--line)] px-3 py-2" defaultValue="">
          <option value="" disabled>
            Vehicle
          </option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.plate})
            </option>
          ))}
        </select>
        <select name="employeeId" required className="rounded-md border border-[var(--line)] px-3 py-2" defaultValue="">
          <option value="" disabled>
            Driver / employee
          </option>
          {employees.filter((e) => e.active).map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <input name="gallons" required type="number" step="0.1" min={0} placeholder="Gallons" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="cost" required type="number" step="0.01" min={0} placeholder="Cost $" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="odometer" required type="number" min={0} placeholder="Odometer" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="station" placeholder="Station" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <button type="submit" className="rounded-md bg-[var(--amber)] px-4 py-2 font-semibold text-[var(--ink)]">
          Save fill
        </button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--foam)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Gallons</th>
              <th className="px-4 py-3">Cost</th>
              <th className="px-4 py-3">Odo</th>
            </tr>
          </thead>
          <tbody>
            {fuelLogs.map((f) => (
              <tr key={f.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-4 py-3">
                  {new Date(f.filledAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {vehicles.find((v) => v.id === f.vehicleId)?.name || f.vehicleId}
                </td>
                <td className="px-4 py-3">{f.gallons}</td>
                <td className="px-4 py-3">{formatCurrency(f.cost)}</td>
                <td className="px-4 py-3">{f.odometer.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
