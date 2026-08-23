"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ActivityTimeline } from "@/components/ScheduleCrm";
import { StatusBadge } from "@/components/StatusBadge";
import {
  fetchJson,
  loadAppData,
  mutateAppData,
  clientNewId,
  clientNowIso,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type {
  Company,
  CrmActivity,
  Deal,
  Employee,
  Lead,
} from "@/lib/types";
import { useSession } from "@/lib/session";
import { formatCurrency } from "@/lib/utils";

export default function CrmHubPage() {
  const { user } = useSession();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const selectedLead = leads.find((l) => l.id === selectedLeadId);
  const leadActivities = activities.filter(
    (a) =>
      a.relatedType === "lead" && a.relatedId === selectedLeadId,
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
    <div>
      <PageHeader
        title="Smart CRM"
        subtitle="HubSpot-style 360° view — contacts, companies, deals, and activity timeline with AI lead scoring."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-xs uppercase text-[var(--muted)]">Contacts</p>
          <p className="text-2xl font-semibold">{leads.length}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-xs uppercase text-[var(--muted)]">Companies</p>
          <p className="text-2xl font-semibold">{companies.length}</p>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-xs uppercase text-[var(--muted)]">Open deals</p>
          <p className="text-2xl font-semibold">
            {deals.filter((d) => !d.stage.startsWith("closed")).length}
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-1">
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl">
            Contacts
          </h2>
          <ul className="max-h-[420px] space-y-2 overflow-y-auto rounded-xl border border-[var(--line)]">
            {leads.map((lead) => (
              <li key={lead.id}>
                <button
                  type="button"
                  onClick={() => setSelectedLeadId(lead.id)}
                  className={`block w-full px-4 py-3 text-left text-sm ${selectedLeadId === lead.id ? "bg-[var(--amber)]/20" : "hover:bg-[var(--panel)]"}`}
                >
                  <span className="font-medium">{lead.name}</span>
                  <span className="block text-xs text-[var(--muted)]">
                    Score {lead.leadScore} · {lead.city}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <h2 className="mb-3 mt-8 font-[family-name:var(--font-display)] text-xl">
            Companies
          </h2>
          <ul className="space-y-2 rounded-xl border border-[var(--line)] p-3 text-sm">
            {companies.map((co) => (
              <li key={co.id}>
                <p className="font-medium">{co.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {co.industry} · {co.domain}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:col-span-2">
          {selectedLead ? (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
                <div>
                  <h2 className="text-xl font-semibold">{selectedLead.name}</h2>
                  <p className="text-sm text-[var(--muted)]">
                    {selectedLead.email} · {selectedLead.phone}
                  </p>
                  <p className="text-sm">{selectedLead.address}, {selectedLead.city}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <StatusBadge status={selectedLead.status} />
                  <span className="text-sm">Lead score: {selectedLead.leadScore}</span>
                </div>
              </div>

              <h3 className="mb-2 font-semibold">Deals</h3>
              {leadDeals.length ? (
                <ul className="mb-6 space-y-2">
                  {leadDeals.map((deal) => (
                    <li
                      key={deal.id}
                      className="flex justify-between rounded-md border border-[var(--line)] px-3 py-2 text-sm"
                    >
                      <span>{deal.title}</span>
                      <span>
                        {deal.stage.replace("_", " ")} · {formatCurrency(deal.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-6 text-sm text-[var(--muted)]">No deals linked.</p>
              )}

              <h3 className="mb-2 font-semibold">Activity timeline</h3>
              <ActivityTimeline activities={leadActivities} employees={employees} />

              <form
                onSubmit={logActivity}
                className="mt-6 grid gap-3 rounded-xl border border-[var(--line)] bg-white p-4 sm:grid-cols-2"
              >
                <h4 className="sm:col-span-2 font-medium">Log activity</h4>
                <select name="type" className="rounded-md border border-[var(--line)] px-3 py-2" defaultValue="note">
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="note">Note</option>
                  <option value="task">Task</option>
                </select>
                <input name="subject" required placeholder="Subject" className="rounded-md border border-[var(--line)] px-3 py-2" />
                <textarea name="body" placeholder="Details" rows={2} className="rounded-md border border-[var(--line)] px-3 py-2 sm:col-span-2" />
                <button type="submit" className="rounded-md bg-[var(--amber)] px-4 py-2 font-semibold text-[var(--ink)] sm:col-span-2">
                  Save to timeline
                </button>
              </form>
            </>
          ) : (
            <p className="text-[var(--muted)]">Select a contact.</p>
          )}
        </section>
      </div>
    </div>
  );
}
