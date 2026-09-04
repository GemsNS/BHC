import { NextResponse } from "next/server";
import { getAIStatus } from "@/lib/ai-provider";
import { getAiUsageStatus } from "@/lib/ai-budget";
import { captchaConfigured, publicCaptchaSiteKey } from "@/lib/captcha";
import { MAINFRAME_AGENTS } from "@/lib/mainframe-agents";

export async function GET() {
  const status = getAIStatus();
  const usage = await getAiUsageStatus();
  return NextResponse.json({
    ...status,
    agents: MAINFRAME_AGENTS.map((a) => ({ id: a.id, label: a.label, blurb: a.blurb })),
    usage: usage.day,
    limits: usage.limits,
    captcha: {
      configured: captchaConfigured(),
      siteKey: publicCaptchaSiteKey(),
    },
  });
}
