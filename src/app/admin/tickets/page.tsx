"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { clientNowIso, fetchJson, loadAppData, mutateAppData } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { Employee, ServiceTicket } from "@/lib/types";

export default function TicketsPage() {
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  async function refresh() {
    const d = await loadAppData();
    setTickets(d.tickets);
    setEmployees(d.employees);
    if (!isStaticDemo()) {
      try {
        const json = await fetchJson<{
          tickets: ServiceTicket[];
          employees: Employee[];
        }>("/api/tickets");
        setTickets(json.tickets);
        setEmployees(json.employees);
      } catch {
        /* local */
      }
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function updateStatus(id: string, status: ServiceTicket["status"]) {
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        const t = d.tickets.find((x) => x.id === id);
        if (t) {
          t.status = status;
          t.updatedAt = clientNowIso();
        }
      });
    } else {
      await fetchJson("/api/crm", {
        method: "PATCH",
        body: JSON.stringify({ ticketId: id, status }),
      });
    }
    await refresh();
  }

  return (
    <div>
      <PageHeader
        title="Service tickets"
        subtitle="Support hub — capture, assign, and resolve customer requests."
      />

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--foam)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assignee</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-4 py-3 font-medium">{t.subject}</td>
                <td className="px-4 py-3">{t.contactName}</td>
                <td className="px-4 py-3 capitalize">{t.priority}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={t.status} />
                </td>
                <td className="px-4 py-3">
                  {employees.find((e) => e.id === t.assigneeId)?.name ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {t.status !== "closed" ? (
                    <button
                      type="button"
                      onClick={() => updateStatus(t.id, "closed")}
                      className="text-xs text-emerald-400"
                    >
                      Close
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
