import {
  runAIAgentLoop,
  type AIChatMessage,
} from "./ai-provider";
import {
  executeMainframeTool,
  toolLookupHrmAsync,
  type MainframeToolName,
  type ToolContext,
} from "./mainframe-tools";
import { toolSendOutreachAsync } from "./mainframe-outreach-server";
import { automationsDue } from "./mainframe-automations";
import { composeAgentSystemPrompt, type MainframeAgentId } from "./mainframe-agents";
import { getAiBudgetLimits } from "./ai-budget-limits";
import type { AppData } from "./types";
import { buildMainframeTools, type ChatMessage, type ChatTurnResult } from "./mainframe-agent";

const SYSTEM_PROMPT = `You are BHC MAINFRAME — admin AI for BH Contracting LTD. (Halifax Regional Municipality, Nova Scotia).
You have FULL CRM access via tools: read, create, update, and delete leads, jobs, invoices, deals, tickets, companies, employees, activities, outreach, memory, and contracts.
Contracts live on disk at /contracts/<slug> (e.g. /contracts/snow). Use register_contract and sync_contract to link them to jobs/leads in the CRM.
When users paste customer lists or contract job info, use import_data or sync_contract.
Use remember_knowledge / search_knowledge for operational facts. lookup_hrm for weather/geocoding.
Be concise, command-center tone. Confirm destructive deletes. Outreach drafts are never auto-sent — approve them, then call send_outreach (or wait for the 15-minute automation tick / Ads → Send now). Never invent contacts or mark outreach as sent without a real SMTP/SMS send.`;

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

function parseLocalIntent(text: string): Array<{ tool: MainframeToolName; args: Record<string, unknown> }> {
  const t = text.trim();
  const lower = t.toLowerCase();
  const runs: Array<{ tool: MainframeToolName; args: Record<string, unknown> }> = [];

  if (/^(help|commands|\?)/i.test(t)) return [];

  if (/automation (status|health)|scheduler status|what('s| is) automated/i.test(t)) {
    runs.push({ tool: "automation_status", args: {} });
  } else if (/daily automation|run automations|morning scan/i.test(t)) {
    runs.push({ tool: "run_daily_automations", args: { force: /force|all/i.test(t) } });
  }

  if (/store health|data health|integrity check/i.test(t)) {
    runs.push({ tool: "store_health", args: {} });
  }

  if (/\b(show|list|any|new|pending|check|review)\b.*\b(job )?ads?\b|\b(job )?ads?\b.*\b(list|show|new|pending|attention|waiting)\b|kijiji|marketplace/i.test(t)) {
    const st = lower.match(/\b(new|drafted|sent|replied|won|lost|skipped)\b/);
    runs.push({ tool: "list_ads", args: st && st[1] !== "new" ? { status: st[1] } : {} });
  }

  if (/outreach (status|queue)|cold (email|text)|how many .*(sent|pending)/i.test(t)) {
    runs.push({ tool: "outreach_status", args: {} });
  }

  {
    const m = t.match(/(enable|disable|turn (?:on|off)|pause|resume) (?:the )?(.+?) automation/i);
    if (m) {
      const verb = m[1].toLowerCase();
      const enabled = /enable|turn on|resume/.test(verb);
      runs.push({ tool: "toggle_automation", args: { id: m[2].trim(), enabled } });
    }
  }

  if (/approve all outreach|approve outreach/i.test(t)) {
    runs.push({ tool: "approve_outreach", args: { all: /all/.test(lower) } });
  }

  if (/send (all )?outreach|send approved|email the leads|send the lead emails/i.test(t)) {
    runs.push({ tool: "send_outreach", args: {} });
  }

  if (/purge (fake|synthetic|junk)|cancel fake|clean (fake|synthetic) outreach/i.test(t)) {
    runs.push({ tool: "purge_synthetic_outreach", args: {} });
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

  const criteriaMatch = t.match(/(?:set criteria|save criteria|hunt criteria)[:\s]+(.+)/i);
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
    if (/then hunt|and hunt/i.test(t)) runs.push({ tool: "hunt_leads", args: {} });
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
• "Approve all outreach"
• "Send outreach" (SMTP/Twilio — approved drafts only)
• "Purge synthetic outreach"
• "HRM weather" / lookup_hrm
• "Hunt leads" / "Find prospects for [lead name]"
• "Create job: Roof replacement for [customer]"
• "Run daily automations"`;
}

export async function runMainframeTurn(
  data: AppData,
  messages: ChatMessage[],
  ctx: ToolContext,
  options?: { agentId?: MainframeAgentId | string },
): Promise<ChatTurnResult> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return { reply: "Awaiting command.", source: "mainframe", toolRuns: [] };

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
      if (name === "send_outreach") {
        const result = await toolSendOutreachAsync(data, ctx);
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

