"use client";

import {
  runMainframeTurn,
  type ChatMessage,
  type ChatTurnResult,
} from "@/lib/mainframe-agent";
import {
  clientNewId,
  clientNowIso,
  fetchJson,
  loadAppData,
  saveAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";

export async function sendMainframeMessage(
  messages: ChatMessage[],
  authorId: string,
  options?: { agentId?: string; attachmentIds?: string[] },
): Promise<ChatTurnResult> {
  if (isStaticDemo()) {
    const clientKey = (await import("@/lib/ai-client")).getClientGeminiKey();
    if (clientKey) {
      const data = await loadAppData();
      const ai = await (await import("@/lib/ai-client")).runMainframeWithClientAi(data, messages, {
        authorId,
        newId: clientNewId,
        nowIso: clientNowIso,
      });
      if (ai?.ok) {
        await saveAppData(data);
        return { ...ai.result, agentId: options?.agentId };
      }
      if (ai && !ai.ok) {
        return {
          reply: `BROWSER GEMINI ERROR\n${ai.error}\n\nFix the key in the sidebar (Save), or clear it to use the local command parser.`,
          source: "mainframe",
          toolRuns: [],
          agentId: options?.agentId,
        };
      }
    }
  }

  if (!isStaticDemo()) {
    try {
      return await fetchJson<ChatTurnResult>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          messages,
          authorId,
          agentId: options?.agentId,
          attachmentIds: options?.attachmentIds,
        }),
      });
    } catch {
      /* fall through to local */
    }
  }

  const data = await loadAppData();
  const result = await runMainframeTurn(
    data,
    messages,
    {
      authorId,
      newId: clientNewId,
      nowIso: clientNowIso,
    },
    { agentId: options?.agentId },
  );
  await saveAppData(data);
  return result;
}
