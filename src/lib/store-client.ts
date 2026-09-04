import type { AppData, Employee } from "./types";

/** Strip secrets from employees before sending store JSON to the browser. */
export function sanitizeEmployeeForClient(employee: Employee): Employee {
  const { pin: _pin, passwordHash, ...safe } = employee;
  return {
    ...safe,
    pin: "",
    passwordHash: null,
    hasPassword: Boolean(passwordHash),
  };
}

export function sanitizeStoreForClient(data: AppData): AppData {
  return {
    ...data,
    employees: data.employees.map(sanitizeEmployeeForClient),
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
