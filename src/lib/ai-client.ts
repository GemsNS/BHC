"use client";

/**
 * Browser-side Gemini for GitHub Pages / static demo testing.
 * Keys: NEXT_PUBLIC_GEMINI_API_KEY, or localStorage `bhc-gemini-api-key` (temporary).
 * NEVER ship production secrets in NEXT_PUBLIC_* — demo/testing only.
 */

import {
  buildMainframeTools,
  type ChatMessage,
  type ChatTurnResult,
} from "./mainframe-agent";
import { executeMainframeTool, type MainframeToolName, type ToolContext } from "./mainframe-tools";
import type { AppData } from "./types";
import type { AIStatus } from "./ai-provider";

const STORAGE_KEY = "bhc-gemini-api-key";
export const CLIENT_AI_KEY_EVENT = "bhc-client-ai-key-changed";

const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

const MODEL_CANDIDATES = [
  process.env.NEXT_PUBLIC_GEMINI_MODEL?.trim(),
  DEFAULT_GEMINI_MODEL,
  "gemini-2.0-flash",
  "gemini-1.5-flash",
].filter((m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i);

export function getClientGeminiKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const fromStorage = localStorage.getItem(STORAGE_KEY)?.trim();
  if (fromStorage) return fromStorage;
  const fromEnv = process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim();
  return fromEnv || undefined;
}

export function setClientGeminiKey(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, key.trim());
  window.dispatchEvent(new Event(CLIENT_AI_KEY_EVENT));
}

export function clearClientGeminiKey(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CLIENT_AI_KEY_EVENT));
}

export function getClientGeminiModel(): string {
  return MODEL_CANDIDATES[0] ?? DEFAULT_GEMINI_MODEL;
}

export function hasClientAiKey(): boolean {
  return Boolean(getClientGeminiKey());
}

/** Status object that includes a pasted browser Gemini key */
export function browserAiStatus(base?: AIStatus | null): AIStatus {
  const key = hasClientAiKey();
  if (key) {
    return {
      provider: "gemini",
      configured: true,
      model: getClientGeminiModel(),
      chat: true,
      summarize: true,
      gemini: true,
      openai: base?.openai ?? false,
    };
  }
  return (
    base ?? {
      provider: "none",
      configured: false,
      model: null,
      chat: false,
      summarize: false,
      gemini: false,
      openai: false,
    }
  );
}

type GeminiPart = {
  text?: string;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; thoughtSignature?: string };
  /** REST may also return snake_case on some payloads */
  thought_signature?: string;
};

/** Keep model parts verbatim so Gemini 3 thoughtSignature survives tool turns. */
function modelPartsFromResponse(json: {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
}): Array<Record<string, unknown>> {
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  // Deep-clone the API parts as-is (thoughtSignature must not be rebuilt away).
  return JSON.parse(JSON.stringify(parts)) as Array<Record<string, unknown>>;
}

async function geminiFetch(
  key: string,
  model: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(body),
    },
  );
}

async function geminiFetchWithFallback(
  key: string,
  body: Record<string, unknown>,
): Promise<{ res: Response; model: string; errorText?: string }> {
  const tried = new Set<string>();
  const queue = [...MODEL_CANDIDATES];
  let lastError = "";
  let lastModel = queue[0] ?? DEFAULT_GEMINI_MODEL;

  while (queue.length) {
    const model = queue.shift()!;
    if (tried.has(model)) continue;
    tried.add(model);
    lastModel = model;
    const res = await geminiFetch(key, model, body);
    if (res.ok) return { res, model };
    lastError = await res.text().catch(() => res.statusText);

    if (res.status === 404) {
      // Prefer "Please update … to use models/X"; fall back to any untried model id in the body.
      const updateHint = lastError.match(/use models\/([a-z0-9._-]+)/i)?.[1];
      const allMentioned = [
        ...lastError.matchAll(/models\/([a-z0-9._-]+)/gi),
      ].map((m) => m[1]);
      for (const suggested of [updateHint, ...allMentioned]) {
        if (suggested && !tried.has(suggested) && !queue.includes(suggested)) {
          queue.unshift(suggested);
        }
      }
      continue;
    }
    return { res, model, errorText: lastError };
  }

  return {
    res: new Response(null, { status: 404 }),
    model: lastModel,
    errorText: lastError || "No Gemini model available",
  };
}

function extractText(json: {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
}): string | null {
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("").trim();
  return text || null;
}

function extractCalls(json: {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
}): Array<{ name: string; args: Record<string, unknown> }> {
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => p.functionCall?.name)
    .map((p) => ({
      name: p.functionCall!.name,
      args: (p.functionCall!.args ?? {}) as Record<string, unknown>,
    }));
}

function friendlyGeminiError(status: number, body: string): string {
  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(body)) {
    return "Gemini rejected this API key (invalid). Paste a fresh key from Google AI Studio and Save again.";
  }
  if (status === 400 && /thought_signature|thoughtSignature/i.test(body)) {
    return "Gemini tool call failed (missing thought signature). Hard-refresh the page and try again — the client must echo Gemini 3 signatures on tool turns.";
  }
  if (status === 403) {
    return "Gemini key is valid but blocked (billing / API not enabled). Enable Generative Language API in Google Cloud.";
  }
  if (status === 429) {
    return "Gemini rate limit hit — wait a minute and try again.";
  }
  const snippet = body.replace(/\s+/g, " ").slice(0, 180);
  return `Gemini request failed (${status})${snippet ? `: ${snippet}` : ""}.`;
}

export async function clientCompleteChat(input: {
  system: string;
  user: string;
}): Promise<string | null> {
  const key = getClientGeminiKey();
  if (!key) return null;
  try {
    const { res } = await geminiFetchWithFallback(key, {
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: "user", parts: [{ text: input.user }] }],
      generationConfig: { temperature: 0.3 },
    });
    if (!res.ok) return null;
    return extractText(await res.json());
  } catch {
    return null;
  }
}

export async function clientSummarizeProgress(input: {
  jobTitle: string;
  customerName: string;
  notes: string[];
  imageCount: number;
}): Promise<{ summary: string; source: "ai" | "local" }> {
  const blob = input.notes.filter(Boolean).join("\n• ");
  const local = [
    `Progress summary — ${input.jobTitle} (${input.customerName})`,
    input.imageCount > 0
      ? `• ${input.imageCount} progress photo(s) on file`
      : "• No progress photos attached",
    ...(blob ? blob.split("\n").map((n) => `• ${n}`) : ["• Crew notes pending"]),
  ].join("\n");

  const text = await clientCompleteChat({
    system:
      "You summarize field crew job progress for a contracting company. Be concise, professional, bullet points. Do not invent facts.",
    user: `Job: ${input.jobTitle}\nCustomer: ${input.customerName}\nPhotos: ${input.imageCount}\nNotes:\n• ${blob || "(none)"}`,
  });
  if (!text) return { summary: local, source: "local" };
  return { summary: text, source: "ai" };
}

const MAINFRAME_SYSTEM = `You are BHC MAINFRAME — admin AI for BH Contracting LTD. CRM.
Execute CRM actions via tools. Outreach always pending approval. Be concise.`;

export type ClientAiResult =
  | { ok: true; result: ChatTurnResult }
  | { ok: false; error: string };

export async function runMainframeWithClientAi(
  data: AppData,
  messages: ChatMessage[],
  ctx: ToolContext,
): Promise<ClientAiResult | null> {
  const key = getClientGeminiKey();
  if (!key) return null;

  const tools = buildMainframeTools();
  const toolRuns: ChatTurnResult["toolRuns"] = [];
  const profile = data.assistantProfiles.find((p) => p.enabled) ?? {};
  const systemText = `${MAINFRAME_SYSTEM}\n\nActive hunt profile: ${JSON.stringify(profile)}`;

  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const functionDeclarations = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  try {
    for (let step = 0; step < 5; step++) {
      const { res, errorText } = await geminiFetchWithFallback(key, {
        systemInstruction: { parts: [{ text: systemText }] },
        contents,
        tools: [{ functionDeclarations }],
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        generationConfig: { temperature: 0.2 },
      });
      if (!res.ok) {
        return {
          ok: false,
          error: friendlyGeminiError(res.status, errorText ?? ""),
        };
      }
      const json = await res.json();
      const calls = extractCalls(json);
      if (calls.length) {
        // Must echo thoughtSignature on functionCall parts (Gemini 3.x requirement).
        contents.push({
          role: "model",
          parts: modelPartsFromResponse(json),
        });
        const responseParts: Array<Record<string, unknown>> = [];
        for (const call of calls) {
          const result = executeMainframeTool(data, call.name as MainframeToolName, call.args, ctx);
          toolRuns.push({ tool: call.name, summary: result.summary, ok: result.ok });
          responseParts.push({
            functionResponse: {
              name: call.name,
              response: { result: result.summary, ok: result.ok },
            },
          });
        }
        contents.push({ role: "user", parts: responseParts });
        continue;
      }
      const reply = extractText(json);
      if (reply) return { ok: true, result: { reply, source: "ai", toolRuns } };
      if (toolRuns.length) {
        return {
          ok: true,
          result: { reply: toolRuns.map((r) => r.summary).join("\n"), source: "ai", toolRuns },
        };
      }
      return {
        ok: false,
        error: "Gemini returned an empty response. Try again or switch model via NEXT_PUBLIC_GEMINI_MODEL.",
      };
    }
    return {
      ok: true,
      result: toolRuns.length
        ? { reply: toolRuns.map((r) => r.summary).join("\n"), source: "ai", toolRuns }
        : { reply: "Done.", source: "ai", toolRuns },
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Browser Gemini call failed: ${err.message}`
          : "Browser Gemini call failed (network or CORS).",
    };
  }
}
