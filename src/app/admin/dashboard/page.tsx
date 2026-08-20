import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { readStore } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await readStore();
  const openLeads = data.leads.filter((l) => !["won", "lost"].includes(l.status));
  const activeJobs = data.jobs.filter((j) =>
    ["scheduled", "in_progress", "on_hold"].includes(j.status),
  );
  const clockedIn = data.timeEntries.filter((t) => t.clockOut === null);
  const pipelineValue = openLeads.length * 18000;

  return (
    <div>
      <PageHeader
        title="Operations dashboard"
        subtitle="Pulse check across leads, jobs, fleet, and crew for Big Hoss Contracting."
        actions={
          <>
            <Link
              href="/admin/leads"
              className="rounded-md bg-[var(--amber)] px-3 py-2 text-sm font-semibold text-[var(--ink)]"
            >
              Add lead
            </Link>
            <Link
              href="/portal"
              className="rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm"
            >
              Open portal
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open leads" value={openLeads.length} hint="Active pipeline" />
        <StatCard label="Active jobs" value={activeJobs.length} hint="In field or scheduled" />
        <StatCard label="Clocked in" value={clockedIn.length} hint="Live crew" />
        <StatCard
          label="Pipeline (est.)"
          value={formatCurrency(pipelineValue)}
          hint="Rough lead value"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--line)] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-2xl">
              Recent leads
            </h2>
            <Link href="/admin/leads" className="text-sm text-[var(--sea)]">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {[...data.leads]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 5)
              .map((lead) => (
                <li key={lead.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{lead.name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {lead.city} · {lead.source} · {lead.jobType}
                    </p>
                  </div>
                  <StatusBadge status={lead.status} />
                </li>
              ))}
          </ul>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-2xl">
              Active jobs
            </h2>
            <Link href="/admin/jobs" className="text-sm text-[var(--sea)]">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {activeJobs.map((job) => (
              <li key={job.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{job.title}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {job.customerName} · {formatCurrency(job.estimatedValue)}
                  </p>
                </div>
                <StatusBadge status={job.status} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-[var(--line)] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            Fleet snapshot
          </h2>
          <Link href="/admin/fleet" className="text-sm text-[var(--sea)]">
            Fleet board
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {data.vehicles.map((v) => (
            <div key={v.id} className="rounded-lg border border-[var(--line)] p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{v.name}</p>
                <StatusBadge status={v.status} />
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {v.plate} · {v.type}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
