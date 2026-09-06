import { DEFAULT_STAFF_PIN } from "./auth-credentials";
import { live } from "./events";
import { normalizeStore } from "./normalize";
import { buildSeedData } from "./seed";
import type { AppData, Employee } from "./types";

/**
 * Reseed the store to a clean production state while keeping the people.
 *
 * keepStaff (default true): every existing employee survives with the same
 *   id / login / name / email / role / phone / rate / active flag, but their
 *   password is cleared and they are back on the bootstrap PIN (0000) with
 *   "must set password" on next sign-in.
 * keepOptOuts (default true): the do-not-contact list is legal record — keep it.
 * Everything else (leads, jobs, invoices, ads, messages, documents metadata,
 * automations state, webhooks, …) is replaced by the seed.
 *
 * Callers should take a backup first (createBackup) — the CLI/console/API do.
 */
export type ReseedOptions = { keepStaff?: boolean; keepOptOuts?: boolean };

export function resetStaffToBootstrap(e: Employee): Employee {
  return {
    ...e,
    pin: DEFAULT_STAFF_PIN,
    passwordHash: null,
    mustChangePassword: true,
    hasPassword: false,
  };
}

export function reseedStore(current: AppData | null, opts: ReseedOptions = {}): { data: AppData; staff: number; keptOptOuts: number } {
  const keepStaff = opts.keepStaff ?? true;
  const keepOptOuts = opts.keepOptOuts ?? true;
  const fresh = normalizeStore(buildSeedData());
  const data: AppData = { ...fresh };
  let staff = fresh.employees.length;
  if (keepStaff && current?.employees.length) {
    const kept = current.employees.map(resetStaffToBootstrap);
    // Make sure at least one active admin exists after the reset
    if (!kept.some((e) => e.active && e.role === "admin")) {
      const seedAdmin = fresh.employees.find((e) => e.role === "admin");
      if (seedAdmin && !kept.some((e) => e.login === seedAdmin.login)) kept.unshift(seedAdmin);
    }
    data.employees = kept;
    staff = kept.length;
  }
  let keptOptOuts = 0;
  if (keepOptOuts && current?.optOuts?.length) {
    data.optOuts = [...current.optOuts];
    keptOptOuts = data.optOuts.length;
  }
  live.system(`Store reseeded`, `${staff} staff account(s) kept on PIN ${DEFAULT_STAFF_PIN}${keptOptOuts ? ` · ${keptOptOuts} opt-out(s) kept` : ""}`, "warn");
  return { data, staff, keptOptOuts };
}
