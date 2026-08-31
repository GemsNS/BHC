import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { buildSeedWithCredentials } from "@/lib/seed";
import { writeStore } from "@/lib/store";

export async function POST(req: NextRequest) {
  const secret = process.env.SEED_SECRET?.trim();
  if (secret) {
    const header = req.headers.get("x-seed-secret");
    if (header !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const { data, credentials } = buildSeedWithCredentials();
  await writeStore(data);

  const credPath = path.join(process.cwd(), "data", "staff-credentials.json");
  await mkdir(path.dirname(credPath), { recursive: true });
  await writeFile(
    credPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: "Production HRM seed — store securely and rotate PINs after first login.",
        staff: credentials,
      },
      null,
      2,
    ),
    "utf8",
  );

  return NextResponse.json({
    ok: true,
    mode: "production",
    region: "Halifax Regional Municipality, NS",
    credentials,
    credentialsFile: "data/staff-credentials.json",
    counts: {
      employees: data.employees.length,
      leads: data.leads.length,
      jobs: data.jobs.length,
      zones: data.zones.length,
      companies: data.companies.length,
      assistantMemory: data.assistantMemory.length,
      workflows: data.workflows.length,
    },
  });
}
