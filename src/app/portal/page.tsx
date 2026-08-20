"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Employee, Job, TimeEntry } from "@/lib/types";

export default function PortalPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [jobId, setJobId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [timeRes, empRes] = await Promise.all([
      fetch("/api/time-entries"),
      fetch("/api/employees"),
    ]);
    const timeJson = await timeRes.json();
    const empJson = await empRes.json();
    setEntries(timeJson.timeEntries);
    setJobs(timeJson.jobs);
    setEmployees(empJson.employees.filter((e: Employee) => e.active));
    if (!employeeId && empJson.employees[0]) {
      setEmployeeId(empJson.employees.find((e: Employee) => e.role === "field")?.id || empJson.employees[0].id);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openEntry = useMemo(
    () =>
      entries.find((e) => e.employeeId === employeeId && e.clockOut === null) ||
      null,
    [entries, employeeId],
  );

  const selected = employees.find((e) => e.id === employeeId);

  async function clock(action: "clock_in" | "clock_out") {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        employeeId,
        jobId: jobId || null,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error || "Action failed");
      return;
    }
    setMessage(
      action === "clock_in"
        ? `Clocked in at ${new Date(json.entry.clockIn).toLocaleTimeString()}`
        : `Clocked out at ${new Date(json.entry.clockOut).toLocaleTimeString()}`,
    );
    await load();
  }

  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--foam)]">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-5 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="font-[family-name:var(--font-display)] text-3xl tracking-wide text-[var(--amber)]">
              BIG HOSS
            </p>
            <p className="text-xs uppercase tracking-[0.18em] text-white/50">
              Employee portal
            </p>
          </div>
          <Link href="/admin/dashboard" className="text-sm text-white/60 hover:text-[var(--amber)]">
            Admin
          </Link>
        </header>

        <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
          <label className="block text-xs uppercase tracking-[0.14em] text-white/50">
            Who are you?
          </label>
          <select
            className="mt-2 w-full rounded-md border border-white/15 bg-[var(--ink)] px-3 py-3"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.role})
              </option>
            ))}
          </select>

          <label className="mt-5 block text-xs uppercase tracking-[0.14em] text-white/50">
            Job (optional)
          </label>
          <select
            className="mt-2 w-full rounded-md border border-white/15 bg-[var(--ink)] px-3 py-3"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            disabled={!!openEntry}
          >
            <option value="">General / no job</option>
            {jobs
              .filter((j) => ["scheduled", "in_progress"].includes(j.status))
              .map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
          </select>

          <div className="mt-8 rounded-xl border border-white/10 bg-black/20 p-4 text-center">
            <p className="text-sm text-white/60">{selected?.name ?? "Select employee"}</p>
            <p className="mt-2 font-[family-name:var(--font-display)] text-4xl tracking-wide">
              {openEntry ? "ON THE CLOCK" : "OFF SHIFT"}
            </p>
            {openEntry ? (
              <p className="mt-2 text-sm text-[var(--amber)]">
                Since {new Date(openEntry.clockIn).toLocaleTimeString()}
              </p>
            ) : null}
          </div>

          <div className="mt-6 grid gap-3">
            {!openEntry ? (
              <button
                type="button"
                disabled={busy || !employeeId}
                onClick={() => clock("clock_in")}
                className="rounded-md bg-[var(--amber)] px-4 py-4 text-lg font-semibold text-[var(--ink)] disabled:opacity-50"
              >
                Clock in
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => clock("clock_out")}
                className="rounded-md bg-white px-4 py-4 text-lg font-semibold text-[var(--ink)] disabled:opacity-50"
              >
                Clock out
              </button>
            )}
          </div>

          {message ? (
            <p className="mt-4 text-center text-sm text-emerald-300">{message}</p>
          ) : null}
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          Punches sync to Hours & Payroll in the admin panel.
        </p>
      </div>
    </div>
  );
}
