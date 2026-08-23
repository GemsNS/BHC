"use client";

import { FormEvent, useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { Deal, Employee, JobType, Lead, LeadStatus } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { loadAppData } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";

export function PipelinePanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    if (isStaticDemo()) {
      const d = await loadAppData();
      setLeads(d.leads);
      setDeals(d.deals);
      setEmployees(d.employees);
    } else {
      const [leadRes, crmRes] = await Promise.all([
        fetch("/api/leads"),
        fetch("/api/crm"),
      ]);
      const leadJson = await leadRes.json();
      const crmJson = await crmRes.json();
      setLeads(leadJson.leads);
      setDeals(crmJson.deals);
      setEmployees(leadJson.employees);
    }
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const jobTypeRaw = String(form.get("jobType") || "residential");
    const payload = {
      name: String(form.get("name") || ""),
      phone: String(form.get("phone") || ""),
      email: String(form.get("email") || ""),
      address: String(form.get("address") || ""),
      city: String(form.get("city") || ""),
      source: String(form.get("source") || "Website"),
      jobType: (jobTypeRaw === "commercial" ? "commercial" : "residential") as JobType,
      notes: String(form.get("notes") || ""),
      assignedToId: String(form.get("assignedToId") || "") || null,
    };

    if (isStaticDemo()) {
      const { mutateAppData, clientNewId, clientNowIso } = await import(
        "@/lib/client-data"
      );
      const { onLeadCreated } = await import("@/lib/workflows");
      await mutateAppData((d) => {
        const stamp = clientNowIso();
        const lead = {
          id: clientNewId(),
          ...payload,
          status: "new" as const,
          companyId: null,
          leadScore: 50,
          createdAt: stamp,
          updatedAt: stamp,
        };
        d.leads.unshift(lead);
        onLeadCreated(d, lead);
      });
    } else {
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setSaving(false);
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
    <div className="jarvis-panel-stack">
      <section className="jarvis-glass-panel">
        <h3 className="jarvis-panel-title">Open deals</h3>
        <ul className="jarvis-deal-list">
          {deals
            .filter((d) => !d.stage.startsWith("closed"))
            .map((deal) => (
              <li key={deal.id}>
                <span>{deal.title}</span>
                <span className="text-[var(--muted)]">
                  {deal.stage.replace("_", " ")} · {formatCurrency(deal.amount)}
                </span>
              </li>
            ))}
        </ul>
      </section>

      <form onSubmit={onCreate} className="jarvis-glass-panel grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <h3 className="sm:col-span-2 lg:col-span-3 jarvis-panel-title">Add lead</h3>
        <input name="name" required placeholder="Name" className="field-input" />
        <input name="phone" required placeholder="Phone" className="field-input" />
        <input name="email" placeholder="Email" className="field-input" />
        <input name="address" required placeholder="Address" className="field-input" />
        <input name="city" required placeholder="City" className="field-input" />
        <select name="source" className="field-input" defaultValue="Website">
          <option>Website</option>
          <option>Door-to-door</option>
          <option>Referral</option>
        </select>
        <select name="jobType" className="field-input" defaultValue="residential">
          <option value="residential">Residential</option>
          <option value="commercial">Commercial</option>
        </select>
        <select name="assignedToId" className="field-input sm:col-span-2" defaultValue="">
          <option value="">Unassigned</option>
          {employees
            .filter((e) => e.role === "sales" || e.role === "admin")
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
        <button type="submit" disabled={saving} className="btn-primary sm:col-span-2 lg:col-span-3">
          {saving ? "Saving…" : "Create lead"}
        </button>
      </form>

      <div className="jarvis-glass-panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Lead</th>
              <th>Score</th>
              <th>Status</th>
              <th>Advance</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4}>Loading…</td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <p className="font-medium">{lead.name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {lead.city} · {lead.jobType}
                    </p>
                  </td>
                  <td>{lead.leadScore}</td>
                  <td>
                    <StatusBadge status={lead.status} />
                  </td>
                  <td>
                    <select
                      className="field-input !py-1 !text-sm"
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
