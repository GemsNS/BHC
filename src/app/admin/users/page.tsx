"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
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
      login: String(form.get("login") || ""),
      pin: String(form.get("pin") || ""),
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
    <RequireAuth perm={["users", "manage_users"]}>
      <div>
        <PageHeader
          title="Users & roles"
          subtitle="Each employee gets a login + PIN. Roles control which admin sections and apps they see."
        />

        {can("manage_users") ? (
          <form onSubmit={onCreate} className="form-grid">
            <h2>Add user</h2>
            <input name="name" required placeholder="Full name" className="field-input" />
            <input name="email" required placeholder="Email" className="field-input" />
            <input name="login" required placeholder="Login (e.g. jamie)" className="field-input" />
            <input name="pin" required placeholder="PIN (4+ digits)" className="field-input" />
            <input name="phone" placeholder="Phone" className="field-input" />
            <select name="role" defaultValue="knocker" className="field-input">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <input
              name="hourlyRate"
              type="number"
              min={0}
              defaultValue={22}
              className="field-input"
            />
            <button type="submit" className="btn-primary">
              Create user
            </button>
          </form>
        ) : (
          <p className="text-sm text-[var(--muted)]">View-only.</p>
        )}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Login / PIN</th>
                <th>Role</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td>
                    <p className="font-medium">{emp.name}</p>
                    <p className="muted">{emp.email}</p>
                  </td>
                  <td>
                    <div className="cred-edit">
                      <input
                        className="field-input"
                        defaultValue={emp.login}
                        disabled={!can("manage_users")}
                        onBlur={(e) => {
                          if (e.target.value !== emp.login)
                            patch(emp.id, { login: e.target.value });
                        }}
                      />
                      <input
                        className="field-input"
                        defaultValue={emp.pin}
                        disabled={!can("manage_users")}
                        onBlur={(e) => {
                          if (e.target.value !== emp.pin)
                            patch(emp.id, { pin: e.target.value });
                        }}
                      />
                    </div>
                  </td>
                  <td>
                    <select
                      className="field-input"
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
                  <td>
                    <button
                      type="button"
                      disabled={!can("manage_users")}
                      className="linkish"
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

        <section className="perm-legend">
          <h2>Role permissions</h2>
          <div className="perm-grid">
            {ROLES.map((role) => (
              <div key={role} className="perm-card">
                <p className="font-semibold">{ROLE_LABELS[role]}</p>
                <p className="muted">{ROLE_PERMISSIONS[role].join(" · ")}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </RequireAuth>
  );
}
