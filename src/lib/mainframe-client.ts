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
        return ai.result;
      }
      if (ai && !ai.ok) {
        return {
          reply: `BROWSER GEMINI ERROR\n${ai.error}\n\nFix the key in the sidebar (Save), or clear it to use the local command parser.`,
          source: "mainframe",
          toolRuns: [],
        };
      }
    }
  }

  if (!isStaticDemo()) {
    try {
      return await fetchJson<ChatTurnResult>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ messages, authorId }),
      });
    } catch {
      /* fall through to local */
    }
  }

  const data = await loadAppData();
  const result = await runMainframeTurn(data, messages, {
    authorId,
    newId: clientNewId,
    nowIso: clientNowIso,
  });
  await saveAppData(data);
  return result;
}
