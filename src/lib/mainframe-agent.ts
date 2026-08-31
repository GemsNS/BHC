import {
  runAIAgentLoop,
  type AIToolDefinition,
  type AIChatMessage,
} from "./ai-provider";
import {
  executeMainframeTool,
  MAINFRAME_TOOL_NAMES,
  toolLookupHrmAsync,
  type MainframeToolName,
  type ToolContext,
} from "./mainframe-tools";
import { automationsDue } from "./mainframe-automations";
import type { AppData } from "./types";

export type ChatMessage = AIChatMessage;

export type ChatTurnResult = {
  reply: string;
  source: "ai" | "mainframe";
  toolRuns: Array<{ tool: string; summary: string; ok: boolean }>;
  automationsDue?: string[];
};

const SYSTEM_PROMPT = `You are BHC MAINFRAME — admin AI for BH Contracting LTD. (Halifax Regional Municipality, Nova Scotia).
You execute real CRM actions via tools: leads, jobs, invoices, employees, workflows, outreach (always pending approval), lead hunting, and daily automations.
You LEARN: use remember_knowledge to store facts from chat, imports, and lookup_hrm. Use search_knowledge before answering repeat operational questions.
You POPULATE: when the user pastes customer lists, job info, or company data, use import_data or create_lead/create_job/create_employee.
Default geography is HRM (Halifax, Dartmouth, Bedford, Sackville, Cole Harbour). Use lookup_hrm for weather and geocoding.
Be concise, command-center tone. Confirm what you did.
Outreach is NEVER sent automatically — only queued for admin approval.`;

async function buildContextPrompt(data: AppData): Promise<string> {
  const profile = data.assistantProfiles.find((p) => p.enabled) ?? {};
  const memory = data.assistantMemory
    .slice(0, 8)
    .map((m) => `[${m.topic}] ${m.content}`)
    .join("\n");
  let hrm = "";
  try {
    const { buildHrmContextSummary } = await import("./hrm-public");
    hrm = await buildHrmContextSummary();
  } catch {
    hrm = "HRM weather unavailable.";
  }
  return `Active hunt profile: ${JSON.stringify(profile)}
Assistant memory (${data.assistantMemory.length} entries):
${memory || "(empty — teach me with remember_knowledge)"}
${hrm}`;
}

export function buildMainframeTools(): AIToolDefinition[] {
  return MAINFRAME_TOOL_NAMES.map((name) => ({
    name,
    description: toolDescription(name),
    parameters: toolParameters(name),
  }));
}

function toolDescription(name: MainframeToolName): string {
  const map: Record<MainframeToolName, string> = {
    get_summary: "CRM ops summary — open leads, jobs, outreach pending, automations",
    list_leads: "List/filter leads by status or city",
    create_lead: "Create a new lead (default city Halifax, NS)",
    update_lead: "Update lead fields (name, phone, address, city, notes, status)",
    update_lead_status: "Change lead status by name or id",
    list_jobs: "List jobs by title, customer, or id query",
    create_job: "Create a job (optionally linked to a lead)",
    create_invoice: "Generate draft invoice or full report for a job",
    run_workflow: "Run a workflow by id on an optional lead",
    process_sequences: "Process due sequence steps",
    approve_outreach: "Approve outreach drafts (never sends email)",
    find_prospects: "Find prospects for a specific lead",
    hunt_leads: "Hunt leads using criteria profile + queue outreach",
    save_criteria_profile: "Save lead hunt criteria (regions, keywords, job types)",
    create_task: "Create CRM task/activity",
    run_daily_automations: "Run due daily automations",
    remember_knowledge: "Save a fact for future turns (self-learning memory)",
    search_knowledge: "Search saved assistant memory",
    import_data: "Bulk import leads, jobs, companies, or memory from records array",
    create_employee: "Add staff account with login and PIN",
    lookup_hrm: "HRM public data: weather (Open-Meteo), geocode address (Nominatim), or summary",
  };
  return map[name];
}

function toolParameters(name: MainframeToolName): Record<string, unknown> {
  switch (name) {
    case "list_leads":
      return {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["new", "contacted", "qualified", "estimate", "won", "lost"],
          },
          city: { type: "string" },
        },
      };
    case "create_lead":
      return {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          city: { type: "string", description: "Default Halifax" },
          address: { type: "string" },
          jobType: { type: "string", enum: ["residential", "commercial"] },
          notes: { type: "string" },
          source: { type: "string" },
        },
        required: ["name"],
      };
    case "update_lead":
      return {
        type: "object",
        properties: {
          lead: { type: "string" },
          leadId: { type: "string" },
          name: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          city: { type: "string" },
          address: { type: "string" },
          notes: { type: "string" },
          status: {
            type: "string",
            enum: ["new", "contacted", "qualified", "estimate", "won", "lost"],
          },
        },
      };
    case "update_lead_status":
      return {
        type: "object",
        properties: {
          lead: { type: "string", description: "Lead name or id" },
          leadId: { type: "string" },
          status: {
            type: "string",
            enum: ["new", "contacted", "qualified", "estimate", "won", "lost"],
          },
        },
        required: ["status"],
      };
    case "list_jobs":
      return {
        type: "object",
        properties: {
          query: { type: "string", description: "Job title, customer, or id" },
        },
      };
    case "create_job":
      return {
        type: "object",
        properties: {
          title: { type: "string" },
          customerName: { type: "string" },
          address: { type: "string" },
          lead: { type: "string" },
          leadId: { type: "string" },
          jobType: { type: "string", enum: ["residential", "commercial"] },
          estimatedValue: { type: "number" },
          notes: { type: "string" },
        },
        required: ["title"],
      };
    case "create_invoice":
      return {
        type: "object",
        properties: {
          job: { type: "string", description: "Job title or id" },
          jobId: { type: "string" },
          kind: { type: "string", enum: ["invoice", "full_report"] },
          notes: { type: "string" },
        },
      };
    case "run_workflow":
      return {
        type: "object",
        properties: {
          workflowId: { type: "string" },
          leadId: { type: "string" },
        },
      };
    case "approve_outreach":
      return {
        type: "object",
        properties: {
          all: { type: "boolean" },
          id: { type: "string" },
        },
      };
    case "find_prospects":
      return {
        type: "object",
        properties: {
          lead: { type: "string", description: "Lead name or id" },
        },
        required: ["lead"],
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
    case "create_task":
      return {
        type: "object",
        properties: {
          subject: { type: "string" },
          body: { type: "string" },
          relatedType: { type: "string", enum: ["lead", "job", "deal"] },
          relatedId: { type: "string" },
        },
        required: ["subject"],
      };
    case "run_daily_automations":
      return {
        type: "object",
        properties: {
          force: { type: "boolean", description: "Run all enabled automations" },
        },
      };
    case "remember_knowledge":
      return {
        type: "object",
        properties: {
          topic: { type: "string" },
          content: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["content"],
      };
    case "search_knowledge":
      return {
        type: "object",
        properties: {
          query: { type: "string" },
          topic: { type: "string" },
        },
      };
    case "import_data":
      return {
        type: "object",
        properties: {
          records: {
            type: "array",
            items: { type: "object" },
            description: "Array of { type: lead|job|company|memory, ...fields }",
          },
        },
        required: ["records"],
      };
    case "create_employee":
      return {
        type: "object",
        properties: {
          name: { type: "string" },
          login: { type: "string" },
          role: {
            type: "string",
            enum: ["admin", "manager", "sales", "knocker", "field", "office", "driver"],
          },
          email: { type: "string" },
          phone: { type: "string" },
        },
        required: ["name", "login", "role"],
      };
    case "lookup_hrm":
      return {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["summary", "weather", "geocode"] },
          query: { type: "string" },
          address: { type: "string" },
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
        city: createMatch[2]?.trim() ?? "Halifax",
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
  return `MAINFRAME COMMANDS (natural language also works with GEMINI_API_KEY):
• "CRM summary" / "what's pending"
• "Create lead: Jane Doe in Dartmouth commercial"
• Paste customer lists — AI uses import_data
• "Remember: we only service HRM" — saves to assistant memory
• "HRM weather" / lookup_hrm
• "Hunt leads" / "Find prospects for [lead name]"
• "Create job: Roof replacement for [customer]"
• "Approve all outreach"
• "Run daily automations"`;
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
  const contextPrompt = await buildContextPrompt(data);

  const ai = await runAIAgentLoop({
    systemPrompt: SYSTEM_PROMPT,
    contextPrompt,
    messages,
    tools: buildMainframeTools(),
    executeTool: async (name, args) => {
      if (name === "lookup_hrm") {
        const result = await toolLookupHrmAsync(args);
        return { summary: result.summary, ok: result.ok };
      }
      const result = executeMainframeTool(data, name as MainframeToolName, args, ctx);
      return { summary: result.summary, ok: result.ok };
    },
  });

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
      reply: `MAINFRAME LOCAL MODE — I parse direct commands (no API key). Set GEMINI_API_KEY or OPENAI_API_KEY in .env for full NLU.\n\n${helpText()}`,
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
