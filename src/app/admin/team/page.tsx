import { PageHeader } from "@/components/PageHeader";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const data = await readStore();

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Crew roster for sales, field, drivers, and office."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.employees.map((employee) => (
          <article
            key={employee.id}
            className="rounded-xl border border-[var(--line)] bg-white p-5"
          >
            <p className="font-[family-name:var(--font-display)] text-2xl">
              {employee.name}
            </p>
            <p className="mt-1 text-sm capitalize text-[var(--muted)]">
              {employee.role} · {employee.active ? "Active" : "Inactive"}
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted)]">Email</dt>
                <dd>{employee.email}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted)]">Phone</dt>
                <dd>{employee.phone}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted)]">Hire date</dt>
                <dd>{employee.hireDate}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--muted)]">Rate</dt>
                <dd>${employee.hourlyRate}/hr</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
