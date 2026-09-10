"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { loadAppData } from "@/lib/client-data";
import type { AppData } from "@/lib/types";
import { formatCurrency, formatHours } from "@/lib/utils";

function entryMs(clockIn: string, clockOut: string | null): number {
  const end = clockOut ? new Date(clockOut).getTime() : Date.now();
  return Math.max(0, end - new Date(clockIn).getTime());
}

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Halifax",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16);
  }
}

export default function HoursPage() {
  const [data, setData] = useState<AppData | null>(null);
  useEffect(() => {
    loadAppData().then(setData);
  }, []);
  if (!data) return <p className="text-[var(--muted)]">Loading hours…</p>;

  const jobTitle = (jobId: string | null) => {
    if (!jobId) return "—";
    return data.jobs.find((j) => j.id === jobId)?.title ?? jobId;
  };
  const employeeName = (id: string) =>
    data.employees.find((e) => e.id === id)?.name ?? id;

  const byEmployee = data.employees
    .map((employee) => {
      const entries = data.timeEntries.filter((t) => t.employeeId === employee.id);
      const ms = entries.reduce(
        (sum, t) => sum + entryMs(t.clockIn, t.clockOut),
        0,
      );
      const hours = ms / (1000 * 60 * 60);
      return {
        employee,
        hours,
        pay: hours * employee.hourlyRate,
        open: entries.some((t) => t.clockOut === null),
        entryCount: entries.length,
      };
    })
    .filter((row) => row.employee.active || row.hours > 0)
    .sort((a, b) => b.hours - a.hours || a.employee.name.localeCompare(b.employee.name));

  const totalPay = byEmployee.reduce((sum, row) => sum + row.pay, 0);
  const totalHours = byEmployee.reduce((sum, row) => sum + row.hours, 0);

  // Global log — every time entry across jobs (Walid + portal clock + etc.)
  const recentEntries = [...data.timeEntries]
    .sort(
      (a, b) =>
        new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime(),
    )
    .slice(0, 40);

  return (
    <div>
      <PageHeader
        title="Hours & payroll"
        subtitle="Company-wide time tracker — every clock entry rolls up here, including job-linked field shifts."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total hours" value={totalHours.toFixed(1)} />
        <StatCard label="Payroll estimate" value={formatCurrency(totalPay)} />
        <StatCard
          label="Currently clocked in"
          value={data.timeEntries.filter((t) => t.clockOut === null).length}
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--foam)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Pay est.</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {byEmployee.map((row) => (
              <tr key={row.employee.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-4 py-3 font-medium">{row.employee.name}</td>
                <td className="px-4 py-3 capitalize">{row.employee.role}</td>
                <td className="px-4 py-3">{formatHours(row.hours * 3600000)}</td>
                <td className="px-4 py-3">{formatCurrency(row.pay)}</td>
                <td className="px-4 py-3">
                  {row.open ? (
                    <span className="text-emerald-700">Clocked in</span>
                  ) : (
                    <span className="text-[var(--muted)]">Off shift</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-10 text-lg font-semibold text-[var(--ink)]">
        Recent time entries
      </h2>
      <p className="mb-4 text-sm text-[var(--muted)]">
        Full company log from the global hour tracker (job-linked when present).
      </p>
      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--foam)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {recentEntries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-[var(--muted)]">
                  No time entries yet.
                </td>
              </tr>
            ) : (
              recentEntries.map((t) => {
                const ms = entryMs(t.clockIn, t.clockOut);
                return (
                  <tr key={t.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatWhen(t.clockIn)}
                      {t.clockOut ? (
                        <span className="text-[var(--muted)]">
                          {" "}
                          → {formatWhen(t.clockOut)}
                        </span>
                      ) : (
                        <span className="ml-1 text-emerald-700">open</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {employeeName(t.employeeId)}
                    </td>
                    <td className="px-4 py-3 max-w-[14rem] truncate" title={jobTitle(t.jobId)}>
                      {jobTitle(t.jobId)}
                    </td>
                    <td className="px-4 py-3">{formatHours(ms)}</td>
                    <td className="px-4 py-3 max-w-[18rem] truncate text-[var(--muted)]" title={t.notes}>
                      {t.notes || "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
