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
import { composeAgentSystemPrompt, type MainframeAgentId } from "./mainframe-agents";
import { getAiBudgetLimits } from "./ai-budget-limits";
import type { AppData } from "./types";

export type ChatMessage = AIChatMessage;

export type ChatTurnResult = {
  reply: string;
  source: "ai" | "mainframe";
  toolRuns: Array<{ tool: string; summary: string; ok: boolean }>;
  automationsDue?: string[];
  agentId?: string;
};

const SYSTEM_PROMPT = `You are BHC MAINFRAME — admin AI for BH Contracting LTD. (Halifax Regional Municipality, Nova Scotia).
You have FULL CRM access via tools: read, create, update, and delete leads, jobs, invoices, deals, tickets, companies, employees, activities, outreach, memory, and contracts.
Contracts live on disk at /contracts/<slug> (e.g. /contracts/snow). Use register_contract and sync_contract to link them to jobs/leads in the CRM.
When users paste customer lists or contract job info, use import_data or sync_contract.
Use remember_knowledge / search_knowledge for operational facts. lookup_hrm for weather/geocoding.
Be concise, command-center tone. Confirm destructive deletes. Outreach drafts are never auto-sent — approve then mark sent via update_outreach.`;

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
  const map: Partial<Record<MainframeToolName, string>> = {
    get_summary: "CRM ops summary — open leads, jobs, outreach pending, automations",
    list_leads: "List/filter leads by status or city",
    create_lead: "Create a new lead (default city Halifax, NS)",
    update_lead: "Update lead fields (name, phone, address, city, notes, status)",
    update_lead_status: "Change lead status by name or id",
    delete_lead: "Delete a lead by id or name",
    list_jobs: "List jobs by title, customer, or id query",
    create_job: "Create a job (optionally linked to a lead)",
    update_job: "Update job fields (status, value, crew, dates, notes)",
    delete_job: "Delete a job by id or title",
    list_invoices: "List invoices",
    create_invoice: "Generate draft invoice or full report for a job",
    update_invoice: "Update invoice status or notes",
    delete_invoice: "Delete an invoice",
    list_deals: "List deals in pipeline",
    create_deal: "Create a sales deal",
    update_deal: "Update deal stage, amount, or notes",
    delete_deal: "Delete a deal",
    list_tickets: "List service tickets",
    create_ticket: "Create a support ticket",
    update_ticket: "Update ticket status, priority, or assignee",
    delete_ticket: "Delete a ticket",
    list_companies: "List companies",
    update_company: "Update company record",
    delete_company: "Delete a company",
    list_employees: "List staff accounts",
    create_employee: "Add staff account (default PIN 0000 until password set)",
    update_employee: "Update employee role, contact, or active status",
    list_activities: "List CRM activities/tasks",
    create_task: "Create CRM task/activity",
    complete_activity: "Mark activity/task complete",
    delete_activity: "Delete an activity",
    list_outreach: "List outreach queue items",
    approve_outreach: "Approve outreach drafts (never sends email)",
    update_outreach: "Update outreach status (e.g. sent, cancelled)",
    delete_outreach: "Remove outreach draft",
    list_workflows: "List automation workflows",
    list_contracts: "List registered contracts and public URLs",
    register_contract: "Register a contract slug and metadata",
    sync_contract: "Sync contract from contracts/<slug>/meta.json into CRM job/lead",
    run_workflow: "Run a workflow by id on an optional lead",
    process_sequences: "Process due sequence steps",
    find_prospects: "Find prospects for a specific lead",
    hunt_leads: "Hunt leads using criteria profile + queue outreach",
    save_criteria_profile: "Save lead hunt criteria (regions, keywords, job types)",
    run_daily_automations: "Run due daily automations",
    remember_knowledge: "Save a fact for future turns (self-learning memory)",
    search_knowledge: "Search saved assistant memory",
    delete_memory: "Delete an assistant memory entry",
    import_data: "Bulk import leads, jobs, companies, or memory from records array",
    lookup_hrm: "HRM public data: weather (Open-Meteo), geocode address (Nominatim), or summary",
  };
  return map[name] ?? `${name.replace(/_/g, " ")} — CRM operation`;
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
      return {
        type: "object",
        properties: {
          id: { type: "string" },
          query: { type: "string" },
          slug: { type: "string" },
        },
      };
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

  if (/sync contract|import contract/i.test(t)) {
    const m = t.match(/(?:sync contract|import contract)\s+(\w[\w-]*)/i);
    runs.push({ tool: "sync_contract", args: { slug: m?.[1] ?? "snow" } });
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
  options?: { agentId?: MainframeAgentId | string },
): Promise<ChatTurnResult> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return { reply: "Awaiting command.", source: "mainframe", toolRuns: [] };
  }

  if (/^(help|commands|\?)/i.test(lastUser.content.trim())) {
    return { reply: helpText(), source: "mainframe", toolRuns: [], agentId: options?.agentId };
  }

  const due = automationsDue(data).map((a) => a.name);
  const contextPrompt = await buildContextPrompt(data);
  const limits = getAiBudgetLimits();
  const clipped = messages.slice(-limits.maxHistoryMessages).map((m) => ({
    ...m,
    content: m.content.slice(0, limits.maxMessageChars),
  }));

  const ai = await runAIAgentLoop({
    systemPrompt: composeAgentSystemPrompt(SYSTEM_PROMPT, options?.agentId),
    contextPrompt,
    messages: clipped,
    tools: buildMainframeTools(),
    maxSteps: limits.maxSteps,
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
      agentId: options?.agentId,
    };
  }

  const intents = parseLocalIntent(lastUser.content);
  const toolRuns: ChatTurnResult["toolRuns"] = [];

  if (!intents.length) {
    return {
      reply: `MAINFRAME LOCAL MODE — limited command parser. Configure ANTHROPIC_API_KEY (Claude) or GEMINI_API_KEY on the server for full natural-language CRM control.\n\n${helpText()}`,
      source: "mainframe",
      toolRuns: [],
      automationsDue: due.length ? due : undefined,
      agentId: options?.agentId,
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
