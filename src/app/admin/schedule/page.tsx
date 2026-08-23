"use client";

import { FormEvent, useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { ShiftList, ShiftWeekGrid } from "@/components/ScheduleCrm";
import {
  clientNewId,
  clientNowIso,
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import { navigateWeek, openPoolShifts } from "@/lib/shifts";
import { onShiftPostedPool } from "@/lib/workflows";
import type { Employee, Job, Shift } from "@/lib/types";
import { useSession } from "@/lib/session";

export default function AdminSchedulePage() {
  const { user } = useSession();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [selected, setSelected] = useState<Shift | null>(null);

  async function refresh() {
    const d = await loadAppData();
    setShifts(d.shifts);
    setEmployees(d.employees);
    setJobs(d.jobs);
    if (!isStaticDemo()) {
      try {
        const json = await fetchJson<{
          shifts: Shift[];
          employees: Employee[];
          jobs: Job[];
        }>("/api/shifts");
        setShifts(json.shifts);
        setEmployees(json.employees);
        setJobs(json.jobs);
      } catch {
        /* local */
      }
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function createShift(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const startDate = String(form.get("date") || "");
    const startHour = Number(form.get("startHour") || 7);
    const endHour = Number(form.get("endHour") || 15);
    const startAt = new Date(`${startDate}T${String(startHour).padStart(2, "0")}:00:00`);
    const endAt = new Date(`${startDate}T${String(endHour).padStart(2, "0")}:00:00`);
    const employeeId = String(form.get("employeeId") || "") || null;
    const status = String(form.get("status") || "scheduled") as Shift["status"];
    const payload = {
      title: String(form.get("title") || ""),
      employeeId,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      location: String(form.get("location") || ""),
      status,
      isOvertime: status === "overtime",
      jobId: String(form.get("jobId") || "") || null,
      notes: String(form.get("notes") || ""),
      postedById: user?.id ?? null,
    };

    if (isStaticDemo()) {
      await mutateAppData((d) => {
        const stamp = clientNowIso();
        const shift: Shift = {
          id: clientNewId(),
          ...payload,
          claimedById: null,
          claimedAt: null,
          createdAt: stamp,
          updatedAt: stamp,
        };
        d.shifts.unshift(shift);
        if (shift.status === "open_pool" || shift.status === "overtime") {
          onShiftPostedPool(d, shift, user?.id);
        }
      });
    } else {
      await fetchJson("/api/shifts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    e.currentTarget.reset();
    await refresh();
  }

  async function publishToPool(shiftId: string) {
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        const shift = d.shifts.find((s) => s.id === shiftId);
        if (!shift || !user) return;
        shift.employeeId = null;
        shift.status = shift.isOvertime ? "overtime" : "open_pool";
        shift.postedById = user.id;
        shift.updatedAt = clientNowIso();
        onShiftPostedPool(d, shift, user.id);
      });
    } else {
      await fetchJson("/api/shifts", {
        method: "POST",
        body: JSON.stringify({
          action: "publish_pool",
          shiftId,
          postedById: user?.id,
        }),
      });
    }
    await refresh();
  }

  const pool = openPoolShifts(shifts);

  return (
    <div>
      <PageHeader
        title="Team schedule"
        subtitle="Week calendar for all shifts — publish open pool and overtime slots for the team to claim."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setWeekAnchor(navigateWeek(weekAnchor, -1))}
          className="rounded-md border border-[var(--line)] px-3 py-1 text-sm"
        >
          ← Prev week
        </button>
        <span className="text-sm font-medium">
          Week of {format(weekAnchor, "MMM d, yyyy")}
        </span>
        <button
          type="button"
          onClick={() => setWeekAnchor(navigateWeek(weekAnchor, 1))}
          className="rounded-md border border-[var(--line)] px-3 py-1 text-sm"
        >
          Next week →
        </button>
        <button
          type="button"
          onClick={() => setWeekAnchor(new Date())}
          className="rounded-md border border-[var(--line)] px-3 py-1 text-sm"
        >
          Today
        </button>
      </div>

      <ShiftWeekGrid
        shifts={shifts}
        employees={employees}
        anchor={weekAnchor}
        onSelectShift={setSelected}
      />

      {selected ? (
        <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h3 className="font-semibold">{selected.title}</h3>
          <p className="text-sm text-[var(--muted)]">{selected.notes}</p>
          {selected.status === "scheduled" && selected.employeeId ? (
            <button
              type="button"
              onClick={() => publishToPool(selected.id)}
              className="mt-3 rounded-md bg-[var(--amber)] px-3 py-1 text-sm font-semibold text-[var(--ink)]"
            >
              Release to open pool
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl">
            Open pool & overtime ({pool.length})
          </h2>
          <ShiftList shifts={pool} employees={employees} />
        </section>

        <section>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl">
            Post a shift
          </h2>
          <form
            onSubmit={createShift}
            className="grid gap-3 rounded-xl border border-[var(--line)] bg-white p-4 sm:grid-cols-2"
          >
            <input
              name="title"
              required
              placeholder="Shift title"
              className="rounded-md border border-[var(--line)] px-3 py-2 sm:col-span-2"
            />
            <input
              name="date"
              type="date"
              required
              defaultValue={format(addDays(new Date(), 1), "yyyy-MM-dd")}
              className="rounded-md border border-[var(--line)] px-3 py-2"
            />
            <select
              name="status"
              className="rounded-md border border-[var(--line)] px-3 py-2"
              defaultValue="scheduled"
            >
              <option value="scheduled">Scheduled</option>
              <option value="open_pool">Open pool</option>
              <option value="overtime">Overtime</option>
            </select>
            <input
              name="startHour"
              type="number"
              min={0}
              max={23}
              defaultValue={7}
              placeholder="Start hour"
              className="rounded-md border border-[var(--line)] px-3 py-2"
            />
            <input
              name="endHour"
              type="number"
              min={0}
              max={23}
              defaultValue={15}
              placeholder="End hour"
              className="rounded-md border border-[var(--line)] px-3 py-2"
            />
            <select
              name="employeeId"
              className="rounded-md border border-[var(--line)] px-3 py-2 sm:col-span-2"
              defaultValue=""
            >
              <option value="">Unassigned / pool</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <select name="jobId" className="rounded-md border border-[var(--line)] px-3 py-2 sm:col-span-2" defaultValue="">
              <option value="">No job link</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
            <input
              name="location"
              placeholder="Location"
              className="rounded-md border border-[var(--line)] px-3 py-2 sm:col-span-2"
            />
            <input
              name="notes"
              placeholder="Notes"
              className="rounded-md border border-[var(--line)] px-3 py-2 sm:col-span-2"
            />
            <button
              type="submit"
              className="rounded-md bg-[var(--amber)] px-4 py-2 font-semibold text-[var(--ink)] sm:col-span-2"
            >
              Publish shift
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
