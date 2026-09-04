import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiEmployee } from "@/lib/api-auth";
import { runMainframeTurn, type ChatMessage } from "@/lib/mainframe-agent";
import { newId, nowIso, readStore, writeStore } from "@/lib/store";
import {
  checkRateLimit,
  clientIp,
  envInt,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import {
  checkAiBudget,
  estimateTokensFromText,
  recordAiUsage,
} from "@/lib/ai-budget";
import { getAIStatus } from "@/lib/ai-provider";
import { MAINFRAME_AGENTS } from "@/lib/mainframe-agents";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const agentIds = MAINFRAME_AGENTS.map((a) => a.id) as [string, ...string[]];

export async function POST(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;

  const ip = clientIp(request);
  const rl = checkRateLimit({
    key: `ai-chat:${employee.id}:${ip}`,
    limit: envInt("RATE_LIMIT_AI_PER_MIN", 20),
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many AI requests. Slow down." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const budget = await checkAiBudget({ employeeId: employee.id });
  if (!budget.ok) {
    return NextResponse.json(
      { error: budget.reason, usage: budget.day, limits: budget.limits },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const body = await request.json();
  const parsed = z
    .object({
      messages: z.array(messageSchema).min(1),
      authorId: z.string().optional(),
      agentId: z.enum(agentIds as [string, ...string[]]).optional(),
      attachmentIds: z.array(z.string()).optional(),
    })
    .safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const authorId = parsed.data.authorId ?? employee.id;
  let messages = parsed.data.messages as ChatMessage[];
  if (parsed.data.attachmentIds?.length) {
    const note = `Attached Mainframe files: ${parsed.data.attachmentIds.join(", ")} (open via /api/uploads/<id>).`;
    messages = [
      ...messages.slice(0, -1),
      {
        ...messages[messages.length - 1],
        content: `${messages[messages.length - 1].content}\n\n${note}`,
      },
    ];
  }

  const data = await readStore();
  const result = await runMainframeTurn(data, messages, {
    authorId,
    newId,
    nowIso,
  }, { agentId: parsed.data.agentId });
  await writeStore(data);

  const status = getAIStatus();
  const last = messages[messages.length - 1]?.content ?? "";
  await recordAiUsage({
    provider: status.provider,
    employeeId: employee.id,
    estimatedTokens: estimateTokensFromText(last + (result.reply || "")),
  });

  return NextResponse.json(result, { headers: rateLimitHeaders(rl) });
}
