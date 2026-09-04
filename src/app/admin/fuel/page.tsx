"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import {
  clientNewId,
  clientNowIso,
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import {
  CRA_RATE_PER_KM,
  UNIACKE_SITE_TRAVEL,
  travelCost,
} from "@/lib/fuel-travel";
import { isStaticDemo } from "@/lib/paths";
import type { Employee, FuelLog, Vehicle } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export default function FuelPage() {
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [travelDistance, setTravelDistance] = useState(
    String(UNIACKE_SITE_TRAVEL.distanceKm),
  );
  const [travelRate, setTravelRate] = useState(String(CRA_RATE_PER_KM));

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
  const gallons = fuelLogs.reduce(
    (s, f) => s + (f.kind === "travel" ? 0 : f.gallons),
    0,
  );
  const travelSpend = fuelLogs
    .filter((f) => f.kind === "travel")
    .reduce((s, f) => s + f.cost, 0);
  const previewCost = useMemo(() => {
    const km = Number(travelDistance) || 0;
    const rate = Number(travelRate) || 0;
    return travelCost(km, rate);
  }, [travelDistance, travelRate]);

  async function persistLog(log: Omit<FuelLog, "id" | "filledAt"> & { filledAt?: string }) {
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        const filledAt = log.filledAt ?? clientNowIso();
        const entry: FuelLog = { id: clientNewId(), ...log, filledAt };
        d.fuelLogs.unshift(entry);
        const v = d.vehicles.find((x) => x.id === entry.vehicleId);
        if (v) {
          v.odometer = Math.max(v.odometer, entry.odometer);
          v.lastUpdate = filledAt;
        }
      });
      return;
    }
    await fetchJson("/api/fuel", {
      method: "POST",
      body: JSON.stringify(log),
    });
  }

  async function onCreateFill(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    await persistLog({
      kind: "fill",
      vehicleId: String(form.get("vehicleId") || ""),
      employeeId: String(form.get("employeeId") || ""),
      gallons: Number(form.get("gallons") || 0),
      cost: Number(form.get("cost") || 0),
      odometer: Number(form.get("odometer") || 0),
      station: String(form.get("station") || ""),
      notes: String(form.get("notes") || ""),
    });
    formEl.reset();
    await refresh();
  }

  async function onCreateTravel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const distanceKm = Number(form.get("distanceKm") || 0);
    const ratePerKm = Number(form.get("ratePerKm") || CRA_RATE_PER_KM);
    const fromAddress = String(form.get("fromAddress") || "");
    const toAddress = String(form.get("toAddress") || "");
    await persistLog({
      kind: "travel",
      vehicleId: String(form.get("vehicleId") || ""),
      employeeId: String(form.get("employeeId") || ""),
      gallons: 0,
      cost: travelCost(distanceKm, ratePerKm),
      odometer: Number(form.get("odometer") || 0),
      station: "Travel / mileage",
      notes: String(form.get("notes") || ""),
      fromAddress,
      toAddress,
      distanceKm,
      ratePerKm,
    });
    formEl.reset();
    setTravelDistance(String(UNIACKE_SITE_TRAVEL.distanceKm));
    setTravelRate(String(CRA_RATE_PER_KM));
    await refresh();
  }

  const activeEmployees = employees.filter((e) => e.active);

  return (
    <div>
      <PageHeader
        title="Fuel & travel"
        subtitle="Log pump fills and mileage / travel reimbursement by vehicle."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total spend" value={formatCurrency(spend)} />
        <StatCard label="Travel / mileage" value={formatCurrency(travelSpend)} />
        <StatCard label="Gallons (fills)" value={gallons.toFixed(1)} />
        <StatCard
          label="$ / gal"
          value={
            gallons
              ? formatCurrency((spend - travelSpend) / gallons)
              : "—"
          }
        />
      </div>

      <form
        onSubmit={onCreateFill}
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
          {activeEmployees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <input name="gallons" required type="number" step="0.1" min={0} placeholder="Gallons" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="cost" required type="number" step="0.01" min={0} placeholder="Cost $" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="odometer" required type="number" min={0} placeholder="Odometer" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="station" placeholder="Station" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="notes" placeholder="Notes" className="rounded-md border border-[var(--line)] px-3 py-2 sm:col-span-2" />
        <button type="submit" className="rounded-md bg-[var(--amber)] px-4 py-2 font-semibold text-[var(--ink)]">
          Save fill
        </button>
      </form>

      <form
        onSubmit={onCreateTravel}
        className="mb-8 grid gap-3 rounded-xl border border-[var(--line)] bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        <h2 className="font-[family-name:var(--font-display)] text-2xl sm:col-span-2 lg:col-span-3">
          Log travel / mileage
        </h2>
        <p className="text-sm text-[var(--muted)] sm:col-span-2 lg:col-span-3">
          Defaults to the Mount Uniacke site round trip from Regency Drive (Dartmouth). Cost uses the CRA
          reasonable rate ({formatCurrency(CRA_RATE_PER_KM)}/km).
        </p>
        <select name="vehicleId" required className="rounded-md border border-[var(--line)] px-3 py-2" defaultValue={vehicles[0]?.id || ""}>
          <option value="" disabled>
            Vehicle
          </option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.plate})
            </option>
          ))}
        </select>
        <select name="employeeId" required className="rounded-md border border-[var(--line)] px-3 py-2" defaultValue={activeEmployees.find((e) => e.id === "emp-driver")?.id || activeEmployees[0]?.id || ""}>
          <option value="" disabled>
            Driver / employee
          </option>
          {activeEmployees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <input
          name="fromAddress"
          required
          defaultValue={UNIACKE_SITE_TRAVEL.fromAddress}
          placeholder="From"
          className="rounded-md border border-[var(--line)] px-3 py-2 sm:col-span-2 lg:col-span-3"
        />
        <input
          name="toAddress"
          required
          defaultValue={UNIACKE_SITE_TRAVEL.toAddress}
          placeholder="To (site)"
          className="rounded-md border border-[var(--line)] px-3 py-2 sm:col-span-2 lg:col-span-3"
        />
        <input
          name="distanceKm"
          required
          type="number"
          step="0.1"
          min={0.1}
          value={travelDistance}
          onChange={(e) => setTravelDistance(e.target.value)}
          placeholder="Round-trip km"
          className="rounded-md border border-[var(--line)] px-3 py-2"
        />
        <input
          name="ratePerKm"
          required
          type="number"
          step="0.01"
          min={0.01}
          value={travelRate}
          onChange={(e) => setTravelRate(e.target.value)}
          placeholder="Rate $/km"
          className="rounded-md border border-[var(--line)] px-3 py-2"
        />
        <input
          name="odometer"
          required
          type="number"
          min={0}
          defaultValue={vehicles[0]?.odometer || 0}
          placeholder="Odometer"
          className="rounded-md border border-[var(--line)] px-3 py-2"
        />
        <input
          name="notes"
          defaultValue={UNIACKE_SITE_TRAVEL.notes}
          placeholder="Notes"
          className="rounded-md border border-[var(--line)] px-3 py-2 sm:col-span-2 lg:col-span-3"
        />
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
          <button type="submit" className="rounded-md bg-[var(--amber)] px-4 py-2 font-semibold text-[var(--ink)]">
            Save travel expense ({formatCurrency(previewCost)})
          </button>
          <span className="text-sm text-[var(--muted)]">
            {travelDistance || "0"} km × {formatCurrency(Number(travelRate) || 0)}/km
          </span>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--foam)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Detail</th>
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
                <td className="px-4 py-3 capitalize">{f.kind || "fill"}</td>
                <td className="px-4 py-3">
                  {vehicles.find((v) => v.id === f.vehicleId)?.name || f.vehicleId}
                </td>
                <td className="px-4 py-3">
                  {f.kind === "travel" ? (
                    <span>
                      {f.distanceKm?.toFixed(1)} km · {f.fromAddress} → {f.toAddress}
                    </span>
                  ) : (
                    <span>
                      {f.gallons} gal{f.station ? ` · ${f.station}` : ""}
                    </span>
                  )}
                </td>
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
