"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageFrame, Panel } from "@/components/cc";
import { RequireAuth } from "@/components/RequireAuth";
import { fetchJson, loadAppData, mutateAppData } from "@/lib/client-data";
import { DEFAULT_STAFF_PIN } from "@/lib/auth-credentials";
import { isStaticDemo } from "@/lib/paths";
import type { Employee, EmployeeRole } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";

const ROLES: EmployeeRole[] = [
  "admin",
  "manager",
  "sales",
  "knocker",
  "field",
  "office",
  "driver",
];

export default function TeamPage() {
  return (
    <RequireAuth perm="manage_users">
      <TeamInner />
    </RequireAuth>
  );
}

function TeamInner() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const data = await loadAppData();
    setEmployees(data.employees);
  }

  useEffect(() => {
    reload();
  }, []);

  async function saveEmployee(id: string, patch: Partial<Employee>) {
    setBusy(true);
    setMessage(null);
    try {
      if (isStaticDemo()) {
        await mutateAppData((data) => {
          const emp = data.employees.find((e) => e.id === id);
          if (!emp) return;
          Object.assign(emp, patch);
        });
      } else {
        await fetchJson("/api/employees", {
          method: "PATCH",
          body: JSON.stringify({ id, ...patch }),
        });
      }
      await reload();
      setMessage("Saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(id: string) {
    await saveEmployee(id, {
      pin: DEFAULT_STAFF_PIN,
      passwordHash: null,
      mustChangePassword: true,
    });
    setMessage(`Reset to default PIN ${DEFAULT_STAFF_PIN} — user must set a new password on login.`);
  }

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const body = {
      name: String(form.get("name")),
      login: String(form.get("login")).toLowerCase(),
      email: String(form.get("email")),
      role: String(form.get("role")) as EmployeeRole,
      phone: String(form.get("phone") || ""),
    };
    try {
      if (isStaticDemo()) {
        await mutateAppData((data) => {
          data.employees.push({
            id: `emp-${Date.now()}`,
            ...body,
            pin: DEFAULT_STAFF_PIN,
            passwordHash: null,
            mustChangePassword: true,
            hireDate: new Date().toISOString().slice(0, 10),
            hourlyRate: 24,
            active: true,
          });
        });
      } else {
        await fetchJson("/api/employees", {
          method: "POST",
          body: JSON.stringify({ ...body, pin: DEFAULT_STAFF_PIN }),
        });
      }
      e.currentTarget.reset();
      await reload();
      setMessage(`Added ${body.name}. Default PIN: ${DEFAULT_STAFF_PIN}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add user");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageFrame
      title="Team & access"
      subtitle="Manage logins, roles, and password resets. First-time sign-in uses PIN 0000, then staff set their own password."
    >
      {message ? <p className="cc-muted">{message}</p> : null}

      <Panel title="Staff accounts">
        <div className="overflow-x-auto">
          <table className="cc-table w-full text-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Login</th>
                <th>Role</th>
                <th>Status</th>
                <th>Password</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td>{emp.name}</td>
                  <td>
                    <code>{emp.login}</code>
                  </td>
                  <td>{ROLE_LABELS[emp.role]}</td>
                  <td>{emp.active ? "Active" : "Inactive"}</td>
                  <td>
                    {emp.mustChangePassword || !emp.passwordHash
                      ? `Pending setup (PIN ${DEFAULT_STAFF_PIN})`
                      : "Password set"}
                  </td>
                  <td className="space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      disabled={busy}
                      onClick={() => resetPassword(emp.id)}
                    >
                      Reset password
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      disabled={busy}
                      onClick={() => saveEmployee(emp.id, { active: !emp.active })}
                    >
                      {emp.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Add team member">
        <form onSubmit={onAdd} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="field">
            <span>Name</span>
            <input name="name" required className="field-input" />
          </label>
          <label className="field">
            <span>Login</span>
            <input name="login" required className="field-input" />
          </label>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" required className="field-input" />
          </label>
          <label className="field">
            <span>Role</span>
            <select name="role" className="field-input" required>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Phone</span>
            <input name="phone" className="field-input" />
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn-primary" disabled={busy}>
              Add user
            </button>
          </div>
        </form>
      </Panel>
    </PageFrame>
  );
}
