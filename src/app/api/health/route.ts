import { NextResponse } from "next/server";
import { getAIStatus } from "@/lib/ai-provider";
import { mailConfigStatus } from "@/lib/mail";
import { schedulerInfo } from "@/lib/scheduler";
import { readStore } from "@/lib/store";
import { storeHealth } from "@/lib/store-health";

export const dynamic = "force-dynamic";

/**
 * Public, secret-free liveness/readiness probe for uptime monitors and the
 * deploy script. Returns 200 when the store is readable, 503 otherwise.
 * Never includes customer data.
 */
export async function GET() {
  const startedAt = Date.now();
  let storeOk = false;
  let storeIssues = 0;
  let lastTickAt: string | null = null;
  try {
    const data = await readStore();
    const health = storeHealth(data);
    storeOk = health.ok;
    storeIssues = health.issues.length;
    lastTickAt = data.automationRuns[0]?.finishedAt ?? null;
  } catch {
    storeOk = false;
  }
  const sched = schedulerInfo();
  const ai = getAIStatus();
  const body = {
    ok: storeOk,
    service: "bhc",
    version: process.env.npm_package_version ?? process.env.BHC_VERSION ?? null,
    commit: process.env.BHC_COMMIT ?? null,
    uptimeSec: Math.round(process.uptime()),
    checkedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
    store: { ok: storeOk, issues: storeIssues },
    scheduler: {
      enabled: sched.enabled,
      started: sched.started,
      lastTickAt: lastTickAt ?? sched.lastTickAt,
      stale: sched.stale,
    },
    ai: { provider: ai.provider, configured: ai.configured },
    mail: { provider: mailConfigStatus().provider },
  };
  return NextResponse.json(body, {
    status: storeOk ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
