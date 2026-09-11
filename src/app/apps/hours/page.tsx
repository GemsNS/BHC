"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppsShell } from "@/components/AppsShell";
import { RequireAuth } from "@/components/RequireAuth";
import { fetchJson, loadAppData } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import { useSession } from "@/lib/session";
import {
  formatDuration,
  LUNCH_DEDUCT_MINUTES,
  openPunchFor,
  paidDurationMs,
  msToHours,
  startOfLocalDay,
  startOfLocalWeek,
  type TimePunch,
} from "@/lib/time-clock";
import type { Job, TimeEntry } from "@/lib/types";

export default function HoursTrackerPage() {
  const { user } = useSession();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        if (isStaticDemo()) {
          const d = await loadAppData();
          setEntries(d.timeEntries);
          setJobs(d.jobs);
          return;
        }
        const json = await fetchJson<{ timeEntries: TimeEntry[]; jobs: Job[] }>(
          "/api/time-entries",
        );
        setEntries(json.timeEntries);
        setJobs(json.jobs);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load hours");
      }
    }
    void load();
  }, []);

  const mine = useMemo(
    () => entries.filter((e) => e.employeeId === user?.id),
    [entries, user?.id],
  );

  const todayStart = startOfLocalDay().getTime();
  const weekStart = startOfLocalWeek().getTime();
  const todayMs = mine
    .filter((e) => new Date(e.clockIn).getTime() >= todayStart)
    .reduce((s, e) => s + paidDurationMs(e.clockIn, e.clockOut), 0);
  const weekMs = mine
    .filter((e) => new Date(e.clockIn).getTime() >= weekStart)
    .reduce((s, e) => s + paidDurationMs(e.clockIn, e.clockOut), 0);
  const open = user ? openPunchFor(mine as TimePunch[], user.id) : null;

  const recent = [...mine]
    .sort((a, b) => b.clockIn.localeCompare(a.clockIn))
    .slice(0, 40);

  return (
    <AppsShell title="Hour tracker">
      <RequireAuth perm="clock">
        <div className="mx-auto max-w-3xl space-y-6">
          <header>
            <h1 className="text-2xl font-semibold">Hour tracker</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Paid time includes an automatic {LUNCH_DEDUCT_MINUTES}-minute lunch
              deduction on punches longer than {LUNCH_DEDUCT_MINUTES} minutes.
              Shifts auto-close at 12 hours — clock in again to continue.
            </p>
          </header>

          {error ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Today (paid)</p>
              <p className="mt-1 text-2xl font-semibold">{formatDuration(todayMs)}</p>
              <p className="text-xs text-[var(--muted)]">{msToHours(todayMs)} h</p>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">This week (paid)</p>
              <p className="mt-1 text-2xl font-semibold">{formatDuration(weekMs)}</p>
              <p className="text-xs text-[var(--muted)]">{msToHours(weekMs)} h</p>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Status</p>
              <p className="mt-1 text-2xl font-semibold">
                {open ? "ON CLOCK" : "OFF SHIFT"}
              </p>
              <Link href="/apps/clock" className="text-sm text-[var(--accent)] underline">
                Open time clock
              </Link>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <table className="data-table min-w-full text-sm">
              <thead>
                <tr>
                  <th>Clock in</th>
                  <th>Clock out</th>
                  <th>Job</th>
                  <th>Paid</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-[var(--muted)]">
                      No punches yet
                    </td>
                  </tr>
                ) : (
                  recent.map((e) => {
                    const job = e.jobId
                      ? jobs.find((j) => j.id === e.jobId)
                      : null;
                    const paid = paidDurationMs(e.clockIn, e.clockOut);
                    return (
                      <tr key={e.id}>
                        <td>{new Date(e.clockIn).toLocaleString()}</td>
                        <td>
                          {e.clockOut
                            ? new Date(e.clockOut).toLocaleString()
                            : "— open —"}
                        </td>
                        <td>{job?.title ?? "—"}</td>
                        <td>{formatDuration(paid)}</td>
                        <td className="max-w-[14rem] truncate text-[var(--muted)]">
                          {e.notes || "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </RequireAuth>
    </AppsShell>
  );
}
