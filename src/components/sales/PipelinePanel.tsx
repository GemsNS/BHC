"use client";

import { FormEvent, useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { Deal, Employee, JobType, Lead, LeadStatus } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { fetchJson, loadAppData } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";

export function PipelinePanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // Always hydrate from the store first so counts/render stay safe even if
      // a subsequent API call is unauthorized or returns an error shape.
      const d = await loadAppData();
      setLeads(Array.isArray(d.leads) ? d.leads : []);
      setDeals(Array.isArray(d.deals) ? d.deals : []);
      setEmployees(Array.isArray(d.employees) ? d.employees : []);

      if (!isStaticDemo()) {
        try {
          const [leadJson, crmJson] = await Promise.all([
            fetchJson<{ leads: Lead[]; employees: Employee[] }>("/api/leads"),
            fetchJson<{ deals: Deal[] }>("/api/crm"),
          ]);
          setLeads(Array.isArray(leadJson.leads) ? leadJson.leads : []);
          setDeals(Array.isArray(crmJson.deals) ? crmJson.deals : []);
          setEmployees(Array.isArray(leadJson.employees) ? leadJson.employees : []);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not refresh pipeline from API");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load pipeline");
      setLeads([]);
      setDeals([]);
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
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

    try {
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
        await fetchJson("/api/leads", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      formEl.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create lead");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: LeadStatus) {
    setError(null);
    try {
      if (isStaticDemo()) {
        const { mutateAppData, clientNowIso } = await import("@/lib/client-data");
        await mutateAppData((d) => {
          const lead = d.leads.find((l) => l.id === id);
          if (!lead) return;
          lead.status = status;
          lead.updatedAt = clientNowIso();
        });
      } else {
        await fetchJson("/api/leads", {
          method: "PATCH",
          body: JSON.stringify({ id, status }),
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update lead");
    }
  }

  const openDeals = deals.filter((d) => d?.stage && !d.stage.startsWith("closed"));

  return (
    <div className="jarvis-panel-stack">
      {error ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {error}
        </p>
      ) : null}

      <section className="jarvis-glass-panel">
        <h3 className="jarvis-panel-title">Open deals</h3>
        <ul className="jarvis-deal-list">
          {loading && openDeals.length === 0 ? (
            <li className="text-[var(--muted)]">Loading…</li>
          ) : openDeals.length === 0 ? (
            <li className="text-[var(--muted)]">No open deals</li>
          ) : (
            openDeals.map((deal) => (
              <li key={deal.id}>
                <span>{deal.title}</span>
                <span className="text-[var(--muted)]">
                  {deal.stage.replace("_", " ")} · {formatCurrency(deal.amount)}
                </span>
              </li>
            ))
          )}
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
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-[var(--muted)]">
                  No leads yet
                </td>
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
