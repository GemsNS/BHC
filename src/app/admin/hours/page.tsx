import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { readStore } from "@/lib/store";
import { formatCurrency, formatHours } from "@/lib/utils";

export const dynamic = "force-dynamic";

function entryMs(clockIn: string, clockOut: string | null): number {
  const end = clockOut ? new Date(clockOut).getTime() : Date.now();
  return Math.max(0, end - new Date(clockIn).getTime());
}

export default async function HoursPage() {
  const data = await readStore();
  const byEmployee = data.employees.map((employee) => {
    const entries = data.timeEntries.filter((t) => t.employeeId === employee.id);
    const ms = entries.reduce(
      (sum, t) => sum + entryMs(t.clockIn, t.clockOut),
      0,
    );
    const hours = ms / (1000 * 60 * 60);
    const pay = hours * employee.hourlyRate;
    const open = entries.some((t) => t.clockOut === null);
    return { employee, hours, pay, open, entries };
  });

  const totalPay = byEmployee.reduce((sum, row) => sum + row.pay, 0);
  const totalHours = byEmployee.reduce((sum, row) => sum + row.hours, 0);

  return (
    <div>
      <PageHeader
        title="Hours & payroll"
        subtitle="Roll time entries into payroll-ready totals. Export integrations can plug in later."
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
              <th className="px-4 py-3">Rate</th>
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
                <td className="px-4 py-3">${row.employee.hourlyRate}/hr</td>
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

      <section className="mt-6 rounded-xl border border-[var(--line)] bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          Recent punches
        </h2>
        <ul className="mt-3 divide-y divide-[var(--line)]">
          {data.timeEntries.slice(0, 10).map((entry) => {
            const emp = data.employees.find((e) => e.id === entry.employeeId);
            return (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="font-medium">{emp?.name ?? entry.employeeId}</span>
                <span className="text-[var(--muted)]">
                  {new Date(entry.clockIn).toLocaleString()}
                  {entry.clockOut
                    ? ` → ${new Date(entry.clockOut).toLocaleString()}`
                    : " → open"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
