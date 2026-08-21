"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  clientNewId,
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { Employee, EmployeeRole } from "@/lib/types";
import { ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/types";
import { useSession } from "@/lib/session";

const ROLES: EmployeeRole[] = [
  "admin",
  "manager",
  "sales",
  "knocker",
  "field",
  "office",
  "driver",
];

export default function UsersPage() {
  const { can, refresh: refreshSession } = useSession();
  const [employees, setEmployees] = useState<Employee[]>([]);

  async function refresh() {
    if (isStaticDemo()) {
      setEmployees((await loadAppData()).employees);
      return;
    }
    try {
      const json = await fetchJson<{ employees: Employee[] }>("/api/employees");
      setEmployees(json.employees);
    } catch {
      setEmployees((await loadAppData()).employees);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!can("manage_users")) return;
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      name: String(form.get("name") || ""),
      email: String(form.get("email") || ""),
      role: String(form.get("role") || "field") as EmployeeRole,
      phone: String(form.get("phone") || ""),
      hourlyRate: Number(form.get("hourlyRate") || 20),
    };
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        d.employees.push({
          id: clientNewId(),
          ...payload,
          hireDate: new Date().toISOString().slice(0, 10),
          active: true,
        });
      });
    } else {
      await fetchJson("/api/employees", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    formEl.reset();
    await refresh();
    await refreshSession();
  }

  async function patch(id: string, body: Partial<Employee>) {
    if (!can("manage_users")) return;
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        const emp = d.employees.find((x) => x.id === id);
        if (emp) Object.assign(emp, body);
      });
    } else {
      await fetchJson("/api/employees", {
        method: "PATCH",
        body: JSON.stringify({ id, ...body }),
      });
    }
    await refresh();
    await refreshSession();
  }

  return (
    <div>
      <PageHeader
        title="Users & roles"
        subtitle="Role-based access for admin panel and field apps (knocker, clock)."
      />

      {!can("manage_users") ? (
        <p className="mb-6 text-sm text-[var(--muted)]">
          View-only. Admins can create users and change roles.
        </p>
      ) : (
        <form
          onSubmit={onCreate}
          className="mb-8 grid gap-3 rounded-xl border border-[var(--line)] bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <h2 className="font-[family-name:var(--font-display)] text-2xl sm:col-span-2 lg:col-span-3">
            Add user
          </h2>
          <input name="name" required placeholder="Full name" className="rounded-md border border-[var(--line)] px-3 py-2" />
          <input name="email" required placeholder="Email" className="rounded-md border border-[var(--line)] px-3 py-2" />
          <input name="phone" placeholder="Phone" className="rounded-md border border-[var(--line)] px-3 py-2" />
          <select name="role" defaultValue="knocker" className="rounded-md border border-[var(--line)] px-3 py-2">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <input name="hourlyRate" type="number" min={0} defaultValue={22} className="rounded-md border border-[var(--line)] px-3 py-2" />
          <button type="submit" className="rounded-md bg-[var(--amber)] px-4 py-2 font-semibold text-[var(--ink)]">
            Create user
          </button>
        </form>
      )}

      <div className="mb-8 overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--foam)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium">{emp.name}</p>
                  <p className="text-xs text-[var(--muted)]">{emp.email}</p>
                </td>
                <td className="px-4 py-3">
                  <select
                    className="rounded-md border border-[var(--line)] px-2 py-1"
                    value={emp.role}
                    disabled={!can("manage_users")}
                    onChange={(e) =>
                      patch(emp.id, { role: e.target.value as EmployeeRole })
                    }
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">${emp.hourlyRate}/hr</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={!can("manage_users")}
                    className="text-sm text-[var(--sea)] disabled:opacity-40"
                    onClick={() => patch(emp.id, { active: !emp.active })}
                  >
                    {emp.active ? "Active" : "Inactive"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-xl border border-[var(--line)] bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">
          Role permissions
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((role) => (
            <div key={role} className="rounded-lg border border-[var(--line)] p-3 text-sm">
              <p className="font-semibold">{ROLE_LABELS[role]}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {ROLE_PERMISSIONS[role].join(" · ")}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
