"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import type { Employee, Lead, LeadStatus } from "@/lib/types";

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/leads");
    const json = await res.json();
    setLeads(json.leads);
    setEmployees(json.employees);
    setLoading(false);
  }

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      name: String(form.get("name") || ""),
      phone: String(form.get("phone") || ""),
      email: String(form.get("email") || ""),
      address: String(form.get("address") || ""),
      city: String(form.get("city") || ""),
      source: String(form.get("source") || "Website"),
      jobType: String(form.get("jobType") || "residential"),
      notes: String(form.get("notes") || ""),
      assignedToId: String(form.get("assignedToId") || "") || null,
    };

    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Could not create lead");
      return;
    }
    formEl.reset();
    await load();
  }

  async function updateStatus(id: string, status: LeadStatus) {
    await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Pipeline for residential renovations, decks, envelopes, and commercial upgrades."
      />

      <form
        onSubmit={onCreate}
        className="mb-8 grid gap-3 rounded-xl border border-[var(--line)] bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        <h2 className="sm:col-span-2 lg:col-span-3 font-[family-name:var(--font-display)] text-2xl">
          New lead
        </h2>
        <input name="name" required placeholder="Name" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="phone" required placeholder="Phone" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="email" placeholder="Email" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="address" required placeholder="Address" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="city" required placeholder="City" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <select name="source" className="rounded-md border border-[var(--line)] px-3 py-2" defaultValue="Website">
          <option>Website</option>
          <option>Door-to-door</option>
          <option>Referral</option>
          <option>Phone</option>
          <option>Repeat customer</option>
        </select>
        <select name="jobType" className="rounded-md border border-[var(--line)] px-3 py-2" defaultValue="residential">
          <option value="residential">Residential</option>
          <option value="commercial">Commercial</option>
        </select>
        <select name="assignedToId" className="rounded-md border border-[var(--line)] px-3 py-2" defaultValue="">
          <option value="">Unassigned</option>
          {employees
            .filter((e) => e.role === "sales" || e.role === "admin")
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
        <input name="notes" placeholder="Notes" className="rounded-md border border-[var(--line)] px-3 py-2 sm:col-span-2" />
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-[var(--amber)] px-4 py-2 font-semibold text-[var(--ink)] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Create lead"}
        </button>
        {error ? <p className="text-sm text-rose-700 sm:col-span-2">{error}</p> : null}
      </form>

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--foam)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Advance</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-[var(--muted)]" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{lead.name}</p>
                    <p className="text-xs text-[var(--muted)]">{lead.phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    {lead.address}, {lead.city}
                    <p className="text-xs capitalize text-[var(--muted)]">{lead.jobType}</p>
                  </td>
                  <td className="px-4 py-3">{lead.source}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-md border border-[var(--line)] px-2 py-1"
                      value={lead.status}
                      onChange={(e) =>
                        updateStatus(lead.id, e.target.value as LeadStatus)
                      }
                    >
                      {["new", "contacted", "qualified", "estimate", "won", "lost"].map(
                        (s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
