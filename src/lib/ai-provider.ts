/**
 * Unified AI provider — Gemini (preferred), OpenAI-compatible, or local fallback.
 */

export type AIProviderId = "gemini" | "openai" | "none";

export type AIStatus = {
  provider: AIProviderId;
  configured: boolean;
  model: string | null;
  chat: boolean;
  summarize: boolean;
  gemini: boolean;
  openai: boolean;
};

export type AIToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AIChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AIToolRun = {
  tool: string;
  summary: string;
  ok: boolean;
};

export type AIAgentLoopResult = {
  reply: string;
  toolRuns: AIToolRun[];
};

function trimKey(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v || undefined;
}

function getGeminiApiKey(): string | undefined {
  return trimKey(process.env.GOOGLE_API_KEY) ?? trimKey(process.env.GEMINI_API_KEY);
}

export function resolveAIProvider(): AIProviderId {
  const forced = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (forced === "gemini") return getGeminiApiKey() ? "gemini" : "none";
  if (forced === "openai") return trimKey(process.env.OPENAI_API_KEY) ? "openai" : "none";
  if (getGeminiApiKey()) return "gemini";
  if (trimKey(process.env.OPENAI_API_KEY)) return "openai";
  return "none";
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
}

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

export function getOpenAIBaseUrl(): string {
  return (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
}

export function getAIStatus(): AIStatus {
  const provider = resolveAIProvider();
  const gemini = Boolean(getGeminiApiKey());
  const openai = Boolean(trimKey(process.env.OPENAI_API_KEY));
  const configured = provider !== "none";
  const model =
    provider === "gemini"
      ? getGeminiModel()
      : provider === "openai"
        ? getOpenAIModel()
        : null;

  return {
    provider,
    configured,
    model,
    chat: configured,
    summarize: configured,
    gemini,
    openai,
  };
}

/** Simple one-shot chat completion (summaries, briefings). Returns null when no provider. */
export async function completeChat(input: {
  system: string;
  user: string;
  temperature?: number;
}): Promise<{ text: string; provider: AIProviderId } | null> {
  const provider = resolveAIProvider();
  if (provider === "none") return null;

  if (provider === "gemini") {
    const text = await geminiGenerateText({
      system: input.system,
      user: input.user,
      temperature: input.temperature ?? 0.3,
    });
    return text ? { text, provider: "gemini" } : null;
  }

  const text = await openaiGenerateText({
    system: input.system,
    user: input.user,
    temperature: input.temperature ?? 0.3,
  });
  return text ? { text, provider: "openai" } : null;
}

/** Multi-step agent loop with tool execution. Returns null when no provider or on hard failure. */
export async function runAIAgentLoop(input: {
  systemPrompt: string;
  contextPrompt?: string;
  messages: AIChatMessage[];
  tools: AIToolDefinition[];
  executeTool: (
    name: string,
    args: Record<string, unknown>,
  ) => { summary: string; ok: boolean };
  maxSteps?: number;
}): Promise<AIAgentLoopResult | null> {
  const provider = resolveAIProvider();
  if (provider === "none") return null;

  if (provider === "gemini") {
    return geminiAgentLoop(input);
  }
  return openaiAgentLoop(input);
}

async function geminiGenerateText(input: {
  system: string;
  user: string;
  temperature: number;
}): Promise<string | null> {
  const key = getGeminiApiKey();
  if (!key) return null;

  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [{ text: input.user }] }],
        generationConfig: { temperature: input.temperature },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as GeminiResponse;
    return extractGeminiText(json);
  } catch {
    return null;
  }
}

async function openaiGenerateText(input: {
  system: string;
  user: string;
  temperature: number;
}): Promise<string | null> {
  const key = trimKey(process.env.OPENAI_API_KEY);
  if (!key) return null;

  try {
    const res = await fetch(`${getOpenAIBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: getOpenAIModel(),
        temperature: input.temperature,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: { name: string; args?: Record<string, unknown> };
      }>;
    };
  }>;
};

function extractGeminiText(json: GeminiResponse): string | null {
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("").trim();
  return text || null;
}

function extractGeminiFunctionCalls(json: GeminiResponse): Array<{ name: string; args: Record<string, unknown> }> {
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => p.functionCall?.name)
    .map((p) => ({
      name: p.functionCall!.name,
      args: (p.functionCall!.args ?? {}) as Record<string, unknown>,
    }));
}

async function geminiAgentLoop(input: {
  systemPrompt: string;
  contextPrompt?: string;
  messages: AIChatMessage[];
  tools: AIToolDefinition[];
  executeTool: (
    name: string,
    args: Record<string, unknown>,
  ) => { summary: string; ok: boolean };
  maxSteps?: number;
}): Promise<AIAgentLoopResult | null> {
  const key = getGeminiApiKey();
  if (!key) return null;

  const model = getGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const toolRuns: AIToolRun[] = [];

  const systemText = [input.systemPrompt, input.contextPrompt].filter(Boolean).join("\n\n");
  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = input.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const functionDeclarations = input.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  for (let step = 0; step < (input.maxSteps ?? 5); step++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents,
          tools: [{ functionDeclarations }],
          toolConfig: { functionCallingConfig: { mode: "AUTO" } },
          generationConfig: { temperature: 0.2 },
        }),
      });
      if (!res.ok) return toolRuns.length ? summarizeToolRuns(toolRuns) : null;
      const json = (await res.json()) as GeminiResponse;

      const calls = extractGeminiFunctionCalls(json);
      if (calls.length) {
        contents.push({
          role: "model",
          parts: calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
        });

        const responseParts: Array<Record<string, unknown>> = [];
        for (const call of calls) {
          const result = input.executeTool(call.name, call.args);
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

      const reply = extractGeminiText(json);
      if (reply) return { reply, toolRuns };
      return toolRuns.length ? summarizeToolRuns(toolRuns) : null;
    } catch {
      return toolRuns.length ? summarizeToolRuns(toolRuns) : null;
    }
  }

  return summarizeToolRuns(toolRuns);
}

async function openaiAgentLoop(input: {
  systemPrompt: string;
  contextPrompt?: string;
  messages: AIChatMessage[];
  tools: AIToolDefinition[];
  executeTool: (
    name: string,
    args: Record<string, unknown>,
  ) => { summary: string; ok: boolean };
  maxSteps?: number;
}): Promise<AIAgentLoopResult | null> {
  const key = trimKey(process.env.OPENAI_API_KEY);
  if (!key) return null;

  const toolRuns: AIToolRun[] = [];
  const openaiTools = input.tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const apiMessages: Array<Record<string, unknown>> = [
    { role: "system", content: input.systemPrompt },
  ];
  if (input.contextPrompt) {
    apiMessages.push({ role: "system", content: input.contextPrompt });
  }
  apiMessages.push(...input.messages.map((m) => ({ role: m.role, content: m.content })));

  for (let step = 0; step < (input.maxSteps ?? 5); step++) {
    try {
      const res = await fetch(`${getOpenAIBaseUrl()}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: getOpenAIModel(),
          temperature: 0.2,
          messages: apiMessages,
          tools: openaiTools,
          tool_choice: "auto",
        }),
      });
      if (!res.ok) return toolRuns.length ? summarizeToolRuns(toolRuns) : null;

      const json = (await res.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
        }>;
      };
      const msg = json.choices?.[0]?.message;
      if (!msg) return toolRuns.length ? summarizeToolRuns(toolRuns) : null;

      if (msg.tool_calls?.length) {
        apiMessages.push({ role: "assistant", tool_calls: msg.tool_calls });
        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
          } catch {
            args = {};
          }
          const result = input.executeTool(tc.function.name, args);
          toolRuns.push({
            tool: tc.function.name,
            summary: result.summary,
            ok: result.ok,
          });
          apiMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result.summary,
          });
        }
        continue;
      }

      return {
        reply: msg.content?.trim() || "Done.",
        toolRuns,
      };
    } catch {
      return toolRuns.length ? summarizeToolRuns(toolRuns) : null;
    }
  }

  return summarizeToolRuns(toolRuns);
}

function summarizeToolRuns(toolRuns: AIToolRun[]): AIAgentLoopResult {
  return {
    reply: toolRuns.map((r) => r.summary).join("\n") || "Completed tool runs.",
    toolRuns,
  };
}
