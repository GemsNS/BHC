"use client";

import { FormEvent, useEffect, useState } from "react";
import { ActivityTimeline } from "@/components/ScheduleCrm";
import { StatusBadge } from "@/components/StatusBadge";
import {
  clientNewId,
  clientNowIso,
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type {
  Company,
  CrmActivity,
  Deal,
  Employee,
  Lead,
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { useSession } from "@/lib/session";

export function ClientsPanel({ initialLeadId }: { initialLeadId?: string | null }) {
  const { user } = useSession();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(
    initialLeadId ?? null,
  );

  async function refresh() {
    const d = await loadAppData();
    setCompanies(d.companies);
    setDeals(d.deals);
    setLeads(d.leads);
    setActivities(d.activities);
    setEmployees(d.employees);
    if (!selectedLeadId && d.leads[0]) setSelectedLeadId(d.leads[0].id);
    if (!isStaticDemo()) {
      try {
        const json = await fetchJson<{
          companies: Company[];
          deals: Deal[];
          leads: Lead[];
          activities: CrmActivity[];
          employees: Employee[];
        }>("/api/crm");
        setCompanies(json.companies);
        setDeals(json.deals);
        setLeads(json.leads);
        setActivities(json.activities);
        setEmployees(json.employees);
      } catch {
        /* local */
      }
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (initialLeadId) setSelectedLeadId(initialLeadId);
  }, [initialLeadId]);

  const selectedLead = leads.find((l) => l.id === selectedLeadId);
  const leadActivities = activities.filter(
    (a) => a.relatedType === "lead" && a.relatedId === selectedLeadId,
  );
  const leadDeals = deals.filter((d) => d.leadId === selectedLeadId);

  async function logActivity(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !selectedLeadId) return;
    const form = new FormData(e.currentTarget);
    const payload = {
      type: String(form.get("type") || "note"),
      subject: String(form.get("subject") || ""),
      body: String(form.get("body") || ""),
      relatedType: "lead" as const,
      relatedId: selectedLeadId,
      authorId: user.id,
    };

    if (isStaticDemo()) {
      await mutateAppData((d) => {
        d.activities.unshift({
          id: clientNewId(),
          type: payload.type as CrmActivity["type"],
          subject: payload.subject,
          body: payload.body,
          relatedType: "lead",
          relatedId: selectedLeadId,
          authorId: user.id,
          dueAt: null,
          completedAt: payload.type === "task" ? null : clientNowIso(),
          createdAt: clientNowIso(),
        });
      });
    } else {
      await fetchJson("/api/crm", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    e.currentTarget.reset();
    await refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <aside className="jarvis-glass-panel lg:col-span-1">
        <h3 className="jarvis-panel-title">Contacts</h3>
        <ul className="jarvis-contact-list">
          {leads.map((lead) => (
            <li key={lead.id}>
              <button
                type="button"
                onClick={() => setSelectedLeadId(lead.id)}
                className={
                  selectedLeadId === lead.id
                    ? "jarvis-contact-active"
                    : "jarvis-contact"
                }
              >
                <span className="font-medium">{lead.name}</span>
                <span className="text-xs text-[var(--muted)]">
                  Score {lead.leadScore} · {lead.city}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <h3 className="jarvis-panel-title mt-6">Companies</h3>
        <ul className="space-y-2 text-sm">
          {companies.map((co) => (
            <li key={co.id}>
              <p className="font-medium">{co.name}</p>
              <p className="text-xs text-[var(--muted)]">{co.industry}</p>
            </li>
          ))}
        </ul>
      </aside>

      <section className="jarvis-glass-panel lg:col-span-2">
        {selectedLead ? (
          <>
            <div className="mb-4 flex flex-wrap justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold">{selectedLead.name}</h3>
                <p className="text-sm text-[var(--muted)]">
                  {selectedLead.email} · {selectedLead.phone}
                </p>
                <p className="text-sm">
                  {selectedLead.address}, {selectedLead.city}
                </p>
              </div>
              <div className="text-right">
                <StatusBadge status={selectedLead.status} />
                <p className="mt-1 text-sm">Score {selectedLead.leadScore}</p>
              </div>
            </div>
            {leadDeals.length ? (
              <ul className="mb-4 space-y-1 text-sm">
                {leadDeals.map((deal) => (
                  <li key={deal.id} className="flex justify-between">
                    <span>{deal.title}</span>
                    <span>{formatCurrency(deal.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <ActivityTimeline activities={leadActivities} employees={employees} />
            <form onSubmit={logActivity} className="mt-4 grid gap-2 sm:grid-cols-2">
              <select name="type" className="field-input" defaultValue="note">
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="meeting">Meeting</option>
                <option value="note">Note</option>
                <option value="task">Task</option>
              </select>
              <input name="subject" required placeholder="Subject" className="field-input" />
              <textarea name="body" placeholder="Details" rows={2} className="field-input sm:col-span-2" />
              <button type="submit" className="btn-primary sm:col-span-2">
                Log activity
              </button>
            </form>
          </>
        ) : (
          <p className="text-[var(--muted)]">Select a contact to view their timeline.</p>
        )}
      </section>
    </div>
  );
}
