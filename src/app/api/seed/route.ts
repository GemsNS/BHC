import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
import { DEFAULT_STAFF_PIN } from "@/lib/auth-credentials";
import { reseedStore } from "@/lib/reseed";
import { createBackup } from "@/lib/store-backup";
import { readStore, writeStore } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/types";

/**
 * Reset the CRM.
 *
 *   POST /api/seed                          → clean seed, role accounts (admin, sales, …) on PIN 0000
 *   POST /api/seed { "keepStaff": true }    → clean seed but KEEP every existing staff account,
 *                                             each reset to PIN 0000 + must-set-password
 *   optional { "keepOptOuts": false }       → also drop the do-not-contact list (kept by default)
 *
 * Auth: SEED_SECRET header (x-seed-secret) — required in production — or an admin session.
 * A backup (data/backups/pre-reseed-*.json) is written first.
 */
export async function POST(req: Request) {
  const secret = process.env.SEED_SECRET?.trim();
  if (process.env.NODE_ENV === "production" && !secret) {
    return NextResponse.json(
      { ok: false, error: "SEED_SECRET required in production" },
      { status: 403 },
    );
  }
  if (secret) {
    const header = req.headers.get("x-seed-secret");
    if (header !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const admin = await requireApiRole(req, ["admin"]);
    if (admin instanceof NextResponse) return admin;
  }

  const body = (await req.json().catch(() => ({}))) as { keepStaff?: boolean; keepOptOuts?: boolean };
  const keepStaff = Boolean(body.keepStaff);
  const current = await readStore();
  const backup = await createBackup({ label: "pre-reseed" });
  const { data: seed, staff, keptOptOuts } = reseedStore(current, { keepStaff, keepOptOuts: body.keepOptOuts ?? true });
  await writeStore(seed);

  return NextResponse.json({
    ok: true,
    mode: keepStaff ? "reseed-keep-staff" : "production",
    message: keepStaff
      ? `CRM reset. ${staff} staff account(s) kept — every one is back on PIN ${DEFAULT_STAFF_PIN} and must set a password on next sign-in.`
      : "CRM reset. Each role has one account — default PIN 0000, set password on first login. Manage users in Admin → Team.",
    backup: backup?.name ?? null,
    defaultPin: DEFAULT_STAFF_PIN,
    keptOptOuts,
    accounts: seed.employees.map((e) => ({
      name: e.name,
      login: e.login,
      role: ROLE_LABELS[e.role],
      email: e.email,
      active: e.active,
    })),
    counts: {
      employees: seed.employees.length,
      leads: seed.leads.length,
      jobs: seed.jobs.length,
    },
  });
}
