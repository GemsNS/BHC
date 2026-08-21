"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { fetchJson, loadAppData, mutateAppData, clientNewId } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { Job, MaterialCost } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<MaterialCost[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  async function refresh() {
    if (isStaticDemo()) {
      const data = await loadAppData();
      setMaterials(data.materials);
      setJobs(data.jobs);
      return;
    }
    try {
      const json = await fetchJson<{ materials: MaterialCost[]; jobs: Job[] }>(
        "/api/materials",
      );
      setMaterials(json.materials);
      setJobs(json.jobs);
    } catch {
      const data = await loadAppData();
      setMaterials(data.materials);
      setJobs(data.jobs);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const total = materials.reduce((s, m) => s + m.quantity * m.unitCost, 0);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      jobId: String(form.get("jobId") || ""),
      description: String(form.get("description") || ""),
      vendor: String(form.get("vendor") || ""),
      quantity: Number(form.get("quantity") || 0),
      unitCost: Number(form.get("unitCost") || 0),
      purchasedAt: String(form.get("purchasedAt") || ""),
      notes: String(form.get("notes") || ""),
    };
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        d.materials.unshift({ id: clientNewId(), ...payload });
      });
    } else {
      await fetchJson("/api/materials", {
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
        title="Material costs"
        subtitle="Track materials against subcontract jobs for margin visibility."
      />
      <div className="mb-6">
        <StatCard label="Total material spend" value={formatCurrency(total)} />
      </div>
      <form
        onSubmit={onCreate}
        className="mb-8 grid gap-3 rounded-xl border border-[var(--line)] bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        <h2 className="font-[family-name:var(--font-display)] text-2xl sm:col-span-2 lg:col-span-3">
          Add material
        </h2>
        <select name="jobId" required className="rounded-md border border-[var(--line)] px-3 py-2" defaultValue="">
          <option value="" disabled>
            Job
          </option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
        <input name="description" required placeholder="Description" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="vendor" placeholder="Vendor" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="quantity" required type="number" step="0.01" min={0} placeholder="Qty" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="unitCost" required type="number" step="0.01" min={0} placeholder="Unit cost" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="purchasedAt" required type="date" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <button type="submit" className="rounded-md bg-[var(--amber)] px-4 py-2 font-semibold text-[var(--ink)]">
          Save
        </button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--foam)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Qty × cost</th>
              <th className="px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{m.description}</p>
                  <p className="text-xs text-[var(--muted)]">{m.vendor || "—"}</p>
                </td>
                <td className="px-4 py-3">
                  {jobs.find((j) => j.id === m.jobId)?.title || m.jobId}
                </td>
                <td className="px-4 py-3">
                  {m.quantity} × {formatCurrency(m.unitCost)}
                </td>
                <td className="px-4 py-3">
                  {formatCurrency(m.quantity * m.unitCost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
