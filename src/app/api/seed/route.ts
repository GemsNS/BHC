import { NextResponse } from "next/server";
import { writeStore } from "@/lib/store";
import { buildSeedData } from "@/lib/seed";
import { DEFAULT_STAFF_PIN } from "@/lib/auth-credentials";
import { ROLE_LABELS } from "@/lib/types";

export async function POST(req: Request) {
  const secret = process.env.SEED_SECRET?.trim();
  if (secret) {
    const header = req.headers.get("x-seed-secret");
    if (header !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const seed = buildSeedData();
  await writeStore(seed);

  return NextResponse.json({
    ok: true,
    mode: "production",
    message:
      "CRM reset. Each role has one account — default PIN 0000, set password on first login. Manage users in Admin → Team.",
    defaultPin: DEFAULT_STAFF_PIN,
    accounts: seed.employees.map((e) => ({
      name: e.name,
      login: e.login,
      role: ROLE_LABELS[e.role],
      email: e.email,
    })),
    counts: {
      employees: seed.employees.length,
      leads: seed.leads.length,
      jobs: seed.jobs.length,
    },
  });
}
