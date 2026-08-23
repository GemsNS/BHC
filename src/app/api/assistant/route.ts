import { NextResponse } from "next/server";
import { z } from "zod";
import { automationsDue, runAutomation, runDailyAutomations } from "@/lib/mainframe-automations";
import { newId, readStore, writeStore } from "@/lib/store";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    profiles: data.assistantProfiles,
    automations: data.assistantAutomations,
    audit: data.assistantAudit.slice(0, 20),
    due: automationsDue(data).map((a) => a.name),
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const action = z
    .enum(["run_daily", "run_automation"])
    .parse(body.action);

  const data = await readStore();
  let summary: string | string[];

  if (action === "run_daily") {
    summary = runDailyAutomations(data, newId, { force: Boolean(body.force) });
  } else {
    const autoId = z.string().parse(body.automationId);
    const auto = data.assistantAutomations.find((a) => a.id === autoId);
    if (!auto) {
      return NextResponse.json({ error: "Automation not found" }, { status: 404 });
    }
    summary = runAutomation(data, auto, newId);
  }

  await writeStore(data);
  return NextResponse.json({ summary });
}
