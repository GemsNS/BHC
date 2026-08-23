import {
  executeMainframeTool,
  MAINFRAME_TOOL_NAMES,
  type MainframeToolName,
  type ToolContext,
} from "./mainframe-tools";
import { automationsDue } from "./mainframe-automations";
import type { AppData } from "./types";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ChatTurnResult = {
  reply: string;
  source: "ai" | "mainframe";
  toolRuns: Array<{ tool: string; summary: string; ok: boolean }>;
  automationsDue?: string[];
};

const SYSTEM_PROMPT = `You are BHC MAINFRAME — the admin AI for BH Contracting Co.'s all-in-one CRM.
You execute real CRM actions via tools: leads, jobs, invoices, workflows, outreach (always pending approval before send), criteria-based lead hunting, and daily automations.
Be concise, command-center tone, ALL CAPS for emphasis sparingly. Confirm what you did.
Outreach is NEVER sent automatically — only queued for admin approval.
When user gives job/criteria info, save it with save_criteria_profile then hunt_leads when appropriate.`;

const OPENAI_TOOLS = MAINFRAME_TOOL_NAMES.map((name) => ({
  type: "function" as const,
  function: {
    name,
    description: toolDescription(name),
    parameters: toolParameters(name),
  },
}));

function toolDescription(name: MainframeToolName): string {
  const map: Record<MainframeToolName, string> = {
    get_summary: "CRM ops summary",
    list_leads: "List/filter leads",
    create_lead: "Create a new lead",
    update_lead_status: "Change lead status",
    list_jobs: "List jobs by query",
    create_invoice: "Generate draft invoice or full report for a job",
    run_workflow: "Run a workflow by id on a lead",
    process_sequences: "Process due sequence steps",
    approve_outreach: "Approve outreach drafts (never sends email)",
    find_prospects: "Find prospects for a specific lead",
    hunt_leads: "Hunt leads using criteria profile + queue outreach",
    save_criteria_profile: "Save lead hunt criteria (regions, keywords, job types)",
    create_task: "Create CRM task/activity",
    run_daily_automations: "Run due daily automations",
  };
  return map[name];
}

function toolParameters(name: MainframeToolName): Record<string, unknown> {
  switch (name) {
    case "create_lead":
      return {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          city: { type: "string" },
          address: { type: "string" },
          jobType: { type: "string", enum: ["residential", "commercial"] },
          notes: { type: "string" },
          source: { type: "string" },
        },
        required: ["name"],
      };
    case "save_criteria_profile":
      return {
        type: "object",
        properties: {
          name: { type: "string" },
          regions: { type: "array", items: { type: "string" } },
          keywords: { type: "array", items: { type: "string" } },
          jobTypes: { type: "array", items: { type: "string" } },
          minLeadScore: { type: "number" },
          outreachTone: { type: "string" },
        },
      };
    default:
      return { type: "object", properties: {} };
  }
}

function parseLocalIntent(text: string): Array<{ tool: MainframeToolName; args: Record<string, unknown> }> {
  const t = text.trim();
  const lower = t.toLowerCase();
  const runs: Array<{ tool: MainframeToolName; args: Record<string, unknown> }> = [];

  if (/^(help|commands|\?)/i.test(t)) {
    return [];
  }

  if (/daily automation|run automations|morning scan/i.test(t)) {
    runs.push({ tool: "run_daily_automations", args: { force: /force|all/i.test(t) } });
  }
  if (/approve all outreach|approve outreach/i.test(t)) {
    runs.push({ tool: "approve_outreach", args: { all: /all/.test(lower) } });
  }
  if (/hunt leads|find leads|prospect hunt|run hunt/i.test(t)) {
    runs.push({ tool: "hunt_leads", args: {} });
  }
  if (/process sequences|run sequences/i.test(t)) {
    runs.push({ tool: "process_sequences", args: {} });
  }
  if (/summary|status|briefing|what'?s pending/i.test(t)) {
    runs.push({ tool: "get_summary", args: {} });
  }
  if (/list leads|show leads|open leads/i.test(t)) {
    const statusMatch = lower.match(/qualified|new|contacted|estimate|won|lost/);
    runs.push({ tool: "list_leads", args: statusMatch ? { status: statusMatch[0] } : {} });
  }
  if (/list jobs|show jobs/i.test(t)) {
    runs.push({ tool: "list_jobs", args: {} });
  }
  if (/find prospects/i.test(t)) {
    const forMatch = t.match(/for\s+(.+)/i);
    runs.push({ tool: "find_prospects", args: { lead: forMatch?.[1]?.trim() ?? "" } });
  }
  if (/generate invoice|create invoice|invoice for/i.test(t)) {
    const m = t.match(/(?:invoice for|generate invoice for|create invoice for)\s+(.+)/i);
    runs.push({ tool: "create_invoice", args: { job: m?.[1]?.trim() ?? "" } });
  }
  if (/run workflow/i.test(t)) {
    runs.push({ tool: "run_workflow", args: { workflowId: "wf-2" } });
  }

  const createMatch = t.match(
    /create lead[:\s]+(.+?)(?:\s+in\s+(\w[\w\s]*))?(?:\s+(residential|commercial))?$/i,
  );
  if (createMatch) {
    runs.push({
      tool: "create_lead",
      args: {
        name: createMatch[1].trim(),
        city: createMatch[2]?.trim() ?? "Denver",
        jobType: createMatch[3]?.toLowerCase() ?? "residential",
      },
    });
  }

  const criteriaMatch = t.match(
    /(?:set criteria|save criteria|hunt criteria)[:\s]+(.+)/i,
  );
  if (criteriaMatch) {
    const blob = criteriaMatch[1];
    const regions = blob.match(/regions?[:\s]+([^;]+)/i)?.[1]?.split(/[,\|]/).map((s) => s.trim());
    const keywords = blob.match(/keywords?[:\s]+([^;]+)/i)?.[1]?.split(/[,\|]/).map((s) => s.trim());
    runs.push({
      tool: "save_criteria_profile",
      args: {
        name: blob.split(";")[0]?.trim() ?? "Custom profile",
        regions: regions ?? undefined,
        keywords: keywords ?? undefined,
      },
    });
    if (/then hunt|and hunt/i.test(t)) {
      runs.push({ tool: "hunt_leads", args: {} });
    }
  }

  if (/qualify\s+(.+)/i.test(t)) {
    const m = t.match(/qualify\s+(.+)/i);
    runs.push({ tool: "update_lead_status", args: { lead: m?.[1], status: "qualified" } });
  }

  return runs;
}

function helpText(): string {
  return `MAINFRAME COMMANDS (natural language also works):
• "CRM summary" / "what's pending"
• "Create lead: Jane Doe in Aurora commercial"
• "Set criteria: storm roof Denver; keywords: hail, insurance — then hunt"
• "Hunt leads" / "Find prospects for Morgan"
• "Generate invoice for Harbor Lane"
• "Approve all outreach"
• "Run daily automations"
• "Process sequences"`;
}

async function callOpenAI(
  messages: ChatMessage[],
  data: AppData,
  ctx: ToolContext,
): Promise<{ reply: string; toolRuns: ChatTurnResult["toolRuns"] } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const toolRuns: ChatTurnResult["toolRuns"] = [];

  const apiMessages: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "system",
      content: `Active hunt profile: ${JSON.stringify(data.assistantProfiles.find((p) => p.enabled) ?? {})}`,
    },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  for (let step = 0; step < 5; step++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: apiMessages,
        tools: OPENAI_TOOLS,
        tool_choice: "auto",
      }),
    });
    if (!res.ok) return null;
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
    if (!msg) return null;

    if (msg.tool_calls?.length) {
      apiMessages.push({ role: "assistant", tool_calls: msg.tool_calls });
      for (const tc of msg.tool_calls) {
        const toolName = tc.function.name as MainframeToolName;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        const result = executeMainframeTool(data, toolName, args, ctx);
        toolRuns.push({ tool: toolName, summary: result.summary, ok: result.ok });
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
  }

  return {
    reply: toolRuns.map((r) => r.summary).join("\n") || "Completed tool runs.",
    toolRuns,
  };
}

export async function runMainframeTurn(
  data: AppData,
  messages: ChatMessage[],
  ctx: ToolContext,
): Promise<ChatTurnResult> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return { reply: "Awaiting command.", source: "mainframe", toolRuns: [] };
  }

  if (/^(help|commands|\?)/i.test(lastUser.content.trim())) {
    return { reply: helpText(), source: "mainframe", toolRuns: [] };
  }

  const due = automationsDue(data).map((a) => a.name);

  const ai = await callOpenAI(messages, data, ctx);
  if (ai) {
    return {
      reply: ai.reply,
      source: "ai",
      toolRuns: ai.toolRuns,
      automationsDue: due.length ? due : undefined,
    };
  }

  const intents = parseLocalIntent(lastUser.content);
  const toolRuns: ChatTurnResult["toolRuns"] = [];

  if (!intents.length) {
    return {
      reply: `MAINFRAME LOCAL MODE — I parse direct commands (no API key). Try:\n${helpText()}`,
      source: "mainframe",
      toolRuns: [],
      automationsDue: due.length ? due : undefined,
    };
  }

  for (const intent of intents) {
    const result = executeMainframeTool(data, intent.tool, intent.args, ctx);
    toolRuns.push({ tool: intent.tool, summary: result.summary, ok: result.ok });
  }

  return {
    reply: toolRuns.map((r) => (r.ok ? `✓ ${r.summary}` : `✗ ${r.summary}`)).join("\n\n"),
    source: "mainframe",
    toolRuns,
    automationsDue: due.length ? due : undefined,
  };
}
