import type { AppData, Employee, EmployeeRole } from "./types";

/** Roles that may see full payroll (all punches + rates). */
const PAYROLL_ROLES: EmployeeRole[] = ["admin", "manager", "office"];

export function canViewPayroll(role: EmployeeRole): boolean {
  return PAYROLL_ROLES.includes(role);
}

/** Strip secrets from employees before sending store JSON to the browser. */
export function sanitizeEmployeeForClient(
  employee: Employee,
  opts?: { hideRate?: boolean },
): Employee {
  const { pin: _pin, passwordHash, ...safe } = employee;
  return {
    ...safe,
    pin: "",
    passwordHash: null,
    hasPassword: Boolean(passwordHash),
    hourlyRate: opts?.hideRate ? 0 : safe.hourlyRate,
  };
}

/**
 * Sanitize store for a browser client.
 * Keeps password-reset tokens off the wire.
 * When `viewer` is a non-payroll role, other employees' rates are zeroed and
 * time entries are limited to the viewer's own punches.
 */
export function sanitizeStoreForClient(
  data: AppData,
  viewer?: Employee | null,
): AppData {
  const payroll = viewer ? canViewPayroll(viewer.role) : true;
  return {
    ...data,
    employees: data.employees.map((e) =>
      sanitizeEmployeeForClient(e, {
        hideRate: !payroll && Boolean(viewer) && e.id !== viewer!.id,
      }),
    ),
    timeEntries:
      payroll || !viewer
        ? data.timeEntries
        : data.timeEntries.filter((t) => t.employeeId === viewer.id),
    // Never expose reset tokens to the browser
    passwordResetTokens: [],
  };
}

/**
 * Preserve server-side credentials when the client PUT omits stripped fields.
 */
export function mergeClientStoreUpdate(
  existing: AppData,
  incoming: Partial<AppData>,
): AppData {
  const merged: AppData = { ...existing, ...incoming } as AppData;
  // Client payloads never carry reset tokens — keep server copy
  if (!incoming.passwordResetTokens) {
    merged.passwordResetTokens = existing.passwordResetTokens ?? [];
  }
  if (!incoming.employees) return merged;

  const prevById = new Map(existing.employees.map((e) => [e.id, e]));
  merged.employees = incoming.employees.map((inc) => {
    const prev = prevById.get(inc.id);
    if (!prev) return inc as Employee;
    const pin =
      inc.pin && inc.pin !== "" && inc.pin !== prev.pin ? inc.pin : prev.pin;
    const passwordHash =
      inc.passwordHash != null && inc.passwordHash !== ""
        ? inc.passwordHash
        : prev.passwordHash;
    return {
      ...prev,
      ...inc,
      pin,
      passwordHash,
    };
  });
  return merged;
}
