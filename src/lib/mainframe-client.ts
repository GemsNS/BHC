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
