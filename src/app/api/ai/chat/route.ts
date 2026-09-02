import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiEmployee } from "@/lib/api-auth";
import { runMainframeTurn, type ChatMessage } from "@/lib/mainframe-agent";
import { newId, nowIso, readStore, writeStore } from "@/lib/store";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export async function POST(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;

  const body = await request.json();
  const parsed = z
    .object({
      messages: z.array(messageSchema).min(1),
      authorId: z.string().optional(),
    })
    .safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const authorId = parsed.data.authorId ?? employee.id;
  const data = await readStore();
  const result = await runMainframeTurn(data, parsed.data.messages as ChatMessage[], {
    authorId,
    newId,
    nowIso,
  });
  await writeStore(data);

  return NextResponse.json(result);
}
