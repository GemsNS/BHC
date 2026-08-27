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
import { flushQbQueue } from "@/lib/quickbooks-ops";

async function maybeFlushQuickBooks(result: ChatTurnResult): Promise<ChatTurnResult> {
  const usedQb = result.toolRuns.some((t) => t.tool.startsWith("qb_"));
  if (!usedQb || isStaticDemo()) return result;
  try {
    const notes = await flushQbQueue(fetchJson);
    if (!notes.length) return result;
    return {
      ...result,
      reply: `${result.reply}\n\nQuickBooks flush:\n${notes.join("\n")}`,
    };
  } catch {
    return result;
  }
}

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
      return maybeFlushQuickBooks(ai.result);
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
      const remote = await fetchJson<ChatTurnResult>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ messages, authorId }),
      });
      return maybeFlushQuickBooks(remote);
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
  return maybeFlushQuickBooks(result);
}
