"use client";

import { useEffect, useState } from "react";
import { AppsShell } from "@/components/AppsShell";
import { RequireAuth } from "@/components/RequireAuth";
import { PageFrame, Panel } from "@/components/cc";
import { ShiftList } from "@/components/ScheduleCrm";
import {
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import { myShifts, openPoolShifts } from "@/lib/shifts";
import type { Employee, Shift } from "@/lib/types";
import { useSession } from "@/lib/session";

export default function AppsSchedulePage() {
  const { user } = useSession();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tab, setTab] = useState<"mine" | "pool">("mine");

  async function refresh() {
    const d = await loadAppData();
    setShifts(d.shifts);
    setEmployees(d.employees);
    if (!isStaticDemo()) {
      try {
        const json = await fetchJson<{ shifts: Shift[]; employees: Employee[] }>(
          "/api/shifts",
        );
        setShifts(json.shifts);
        setEmployees(json.employees);
      } catch {
        /* local */
      }
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when user id available
  }, [user?.id]);

  async function claim(shiftId: string) {
    if (!user) return;
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        const shift = d.shifts.find((s) => s.id === shiftId);
        if (!shift || shift.claimedById) return;
        const stamp = new Date().toISOString();
        shift.claimedById = user.id;
        shift.claimedAt = stamp;
        shift.employeeId = user.id;
        shift.status = shift.isOvertime ? "overtime" : "claimed";
        shift.updatedAt = stamp;
      });
    } else {
      await fetchJson("/api/shifts", {
        method: "POST",
        body: JSON.stringify({
          action: "claim",
          shiftId,
          employeeId: user.id,
        }),
      });
    }
    await refresh();
    setTab("mine");
  }

  const mine = user ? myShifts(shifts, user.id) : [];
  const pool = openPoolShifts(shifts);

  return (
    <AppsShell title="Schedule">
      <RequireAuth perm="schedule">
        <PageFrame
          context="Field mode"
          title="My schedule"
          subtitle="View your posted shifts and claim open pool or overtime slots."
        >
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setTab("mine")}
              className={`rounded-md px-3 py-1 text-sm ${tab === "mine" ? "bg-[var(--amber)] text-[var(--ink)]" : "border border-[var(--line)]"}`}
            >
              My shifts ({mine.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("pool")}
              className={`rounded-md px-3 py-1 text-sm ${tab === "pool" ? "bg-[var(--amber)] text-[var(--ink)]" : "border border-[var(--line)]"}`}
            >
              Open pool ({pool.length})
            </button>
          </div>

          <Panel title={tab === "mine" ? "Assigned & claimed" : "Available shifts"}>
            {tab === "mine" ? (
              <ShiftList
                shifts={mine}
                employees={employees}
                emptyLabel="No shifts assigned yet — check the open pool."
              />
            ) : (
              <ShiftList
                shifts={pool}
                employees={employees}
                emptyLabel="No open shifts right now."
                claimable
                onClaim={claim}
              />
            )}
          </Panel>
        </PageFrame>
      </RequireAuth>
    </AppsShell>
  );
}
