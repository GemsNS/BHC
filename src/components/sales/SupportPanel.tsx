"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { clientNowIso, fetchJson, loadAppData, mutateAppData } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { Employee, ServiceTicket } from "@/lib/types";

export function SupportPanel() {
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
    void refresh();
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
    <div className="jarvis-glass-panel overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Contact</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Owner</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id}>
              <td>{t.subject}</td>
              <td>{t.contactName}</td>
              <td>{t.priority}</td>
              <td>
                <StatusBadge status={t.status} />
              </td>
              <td>{employees.find((e) => e.id === t.assigneeId)?.name ?? "—"}</td>
              <td>
                {t.status !== "closed" ? (
                  <button
                    type="button"
                    className="linkish text-xs"
                    onClick={() => updateStatus(t.id, "closed")}
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
  );
}
