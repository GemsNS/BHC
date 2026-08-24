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

const STORAGE_KEY = "bhc-gemini-api-key";

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
}

export function clearClientGeminiKey(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function getClientGeminiModel(): string {
  return process.env.NEXT_PUBLIC_GEMINI_MODEL?.trim() || "gemini-2.0-flash";
}

export function hasClientAiKey(): boolean {
  return Boolean(getClientGeminiKey());
}

type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
};

async function geminiFetch(
  key: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const model = getClientGeminiModel();
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

export async function clientCompleteChat(input: {
  system: string;
  user: string;
}): Promise<string | null> {
  const key = getClientGeminiKey();
  if (!key) return null;
  try {
    const res = await geminiFetch(key, {
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

const MAINFRAME_SYSTEM = `You are BHC MAINFRAME — admin AI for BH Contracting Co. CRM.
Execute CRM actions via tools. Outreach always pending approval. Be concise.`;

export async function runMainframeWithClientAi(
  data: AppData,
  messages: ChatMessage[],
  ctx: ToolContext,
): Promise<ChatTurnResult | null> {
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

  for (let step = 0; step < 5; step++) {
    const res = await geminiFetch(key, {
      systemInstruction: { parts: [{ text: systemText }] },
      contents,
      tools: [{ functionDeclarations }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      generationConfig: { temperature: 0.2 },
    });
    if (!res.ok) return toolRuns.length ? { reply: toolRuns.map((r) => r.summary).join("\n"), source: "ai", toolRuns } : null;
    const json = await res.json();
    const calls = extractCalls(json);
    if (calls.length) {
      contents.push({
        role: "model",
        parts: calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
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
    if (reply) return { reply, source: "ai", toolRuns };
    return toolRuns.length ? { reply: toolRuns.map((r) => r.summary).join("\n"), source: "ai", toolRuns } : null;
  }
  return null;
}
