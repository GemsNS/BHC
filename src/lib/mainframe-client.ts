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
import { getClientGeminiKey, runMainframeWithClientAi } from "@/lib/ai-client";
import { isStaticDemo } from "@/lib/paths";

export async function sendMainframeMessage(
  messages: ChatMessage[],
  authorId: string,
): Promise<ChatTurnResult> {
  const clientKey = getClientGeminiKey();
  if (clientKey) {
    const data = await loadAppData();
    const ai = await runMainframeWithClientAi(data, messages, {
      authorId,
      newId: clientNewId,
      nowIso: clientNowIso,
    });
    if (ai?.ok) {
      await saveAppData(data);
      return ai.result;
    }
    if (ai && !ai.ok) {
      // Key is present but Gemini failed — surface the real error, don't pretend there's no key
      return {
        reply: `BROWSER GEMINI ERROR\n${ai.error}\n\nFix the key in the sidebar (Save), or clear it to use the local command parser / server .env key.`,
        source: "mainframe",
        toolRuns: [],
      };
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
