"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import type { CanvassStop, Employee } from "@/lib/types";

export default function CanvassPage() {
  const [stops, setStops] = useState<CanvassStop[]>([]);
  const [reps, setReps] = useState<Employee[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/canvass");
    const json = await res.json();
    setStops(json.stops);
    setReps(json.employees);
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const createLead = form.get("createLead") === "on";
    const res = await fetch("/api/canvass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: String(form.get("address") || ""),
        city: String(form.get("city") || ""),
        outcome: String(form.get("outcome") || "not_home"),
        notes: String(form.get("notes") || ""),
        salesRepId: String(form.get("salesRepId") || ""),
        createLead,
        leadName: String(form.get("leadName") || ""),
        leadPhone: String(form.get("leadPhone") || ""),
      }),
    });
    const json = await res.json();
    if (json.lead) {
      setMessage(`Stop logged and lead created: ${json.lead.name}`);
    } else {
      setMessage("Stop logged.");
    }
    e.currentTarget.reset();
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Door-to-door"
        subtitle="Log canvass stops and convert appointments straight into the lead pipeline."
      />

      <form
        onSubmit={onCreate}
        className="mb-8 grid gap-3 rounded-xl border border-[var(--line)] bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        <h2 className="font-[family-name:var(--font-display)] text-2xl sm:col-span-2 lg:col-span-3">
          Log stop
        </h2>
        <input name="address" required placeholder="Address" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="city" required placeholder="City" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <select name="outcome" defaultValue="interested" className="rounded-md border border-[var(--line)] px-3 py-2">
          <option value="not_home">Not home</option>
          <option value="interested">Interested</option>
          <option value="appointment">Appointment</option>
          <option value="not_interested">Not interested</option>
          <option value="do_not_knock">Do not knock</option>
        </select>
        <select name="salesRepId" required className="rounded-md border border-[var(--line)] px-3 py-2" defaultValue={reps[0]?.id || ""}>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <input name="notes" placeholder="Notes" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <label className="flex items-center gap-2 text-sm">
          <input name="createLead" type="checkbox" defaultChecked />
          Create CRM lead if interested / appointment
        </label>
        <input name="leadName" placeholder="Lead name (optional)" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="leadPhone" placeholder="Lead phone (optional)" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <button type="submit" className="rounded-md bg-[var(--amber)] px-4 py-2 font-semibold text-[var(--ink)]">
          Save stop
        </button>
        {message ? (
          <p className="text-sm text-emerald-800 sm:col-span-2 lg:col-span-3">{message}</p>
        ) : null}
      </form>

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--foam)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">Outcome</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {stops.map((stop) => (
              <tr key={stop.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-4 py-3">
                  {stop.address}, {stop.city}
                  {stop.leadId ? (
                    <p className="text-xs text-emerald-700">Linked lead</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={stop.outcome} />
                </td>
                <td className="px-4 py-3">{stop.notes || "—"}</td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">
                  {new Date(stop.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
