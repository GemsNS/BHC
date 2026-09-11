/**
 * Mainframe agent harness — unattended "full ops manager" sweep.
 *
 * Ships disabled (catalog `defaultEnabled: false`). Even when an operator enables
 * the automation in Admin → Automation, `AGENT_HARNESS_ENABLED=0` hard-kills it.
 *
 * Guardrails (enforced in code):
 *  - Tool allowlist: reads + reversible internal writes only
 *  - delete_*, send_outreach, approve_outreach, update_outreach, update_invoice,
 *    toggle_automation, run_daily_automations, import_data, contracts, HR writes
 *    are refused; the model must list them under NEEDS HUMAN
 *  - Cost guard: checkAiBudget / recordAiUsage under actor emp-mainframe-agent
 *  - Output sections DID / NEEDS HUMAN / NOTED → audit + owner notification
 */

import {
  checkAiBudget,
  estimateTokensFromText,
  recordAiUsage,
} from "./ai-budget";
import { getAiBudgetLimits } from "./ai-budget-limits";
import {
  runAIAgentLoop,
  type AIAgentLoopResult,
  type AIToolDefinition,
} from "./ai-provider";
import { audit } from "./mainframe-automations";
import {
  executeMainframeTool,
  MAINFRAME_TOOL_NAMES,
  type MainframeToolName,
  type ToolContext,
} from "./mainframe-tools";
import { enqueueNotification } from "./notifications";
import type { AppData } from "./types";

export const AGENT_HARNESS_ACTOR_ID = "emp-mainframe-agent";

/** Reads + reversible internal writes the unattended agent may call. */
export const AGENT_HARNESS_ALLOWED_TOOLS: readonly MainframeToolName[] = [
  "get_summary",
  "list_leads",
  "create_lead",
  "update_lead",
  "update_lead_status",
  "list_jobs",
  "create_job",
  "update_job",
  "list_invoices",
  "create_invoice",
  "list_deals",
  "create_deal",
  "update_deal",
  "list_tickets",
  "create_ticket",
  "update_ticket",
  "list_companies",
  "update_company",
  "list_employees",
  "list_activities",
  "create_task",
  "complete_activity",
  "list_outreach",
  "list_workflows",
  "list_contracts",
  "find_prospects",
  "hunt_leads",
  "remember_knowledge",
  "search_knowledge",
  "lookup_hrm",
  "automation_status",
  "store_health",
  "list_ads",
  "outreach_status",
];

const ALLOWED_SET = new Set<string>(AGENT_HARNESS_ALLOWED_TOOLS);

/** Explicit denylist — refused even if somehow offered to the model. */
export const AGENT_HARNESS_DENIED_TOOLS: readonly string[] = [
  "delete_lead",
  "delete_job",
  "delete_invoice",
  "delete_deal",
  "delete_ticket",
  "delete_company",
  "delete_activity",
  "delete_outreach",
  "delete_memory",
  "send_outreach",
  "approve_outreach",
  "update_outreach",
  "update_invoice",
  "toggle_automation",
  "run_daily_automations",
  "import_data",
  "register_contract",
  "sync_contract",
  "run_workflow",
  "process_sequences",
  "save_criteria_profile",
  "create_employee",
  "update_employee",
  "purge_synthetic_outreach",
];

const DENIED_SET = new Set(AGENT_HARNESS_DENIED_TOOLS);

export function agentHarnessEnvEnabled(): boolean {
  const v = (process.env.AGENT_HARNESS_ENABLED ?? "0").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function agentHarnessMaxSteps(): number {
  const raw = process.env.AGENT_HARNESS_MAX_STEPS?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 20) return Math.floor(n);
  return Math.min(8, getAiBudgetLimits().maxSteps);
}

export type AgentHarnessToolGate = { allowed: boolean; summary: string };

/** Pure gate used by execute path + tests — never mutates. */
export function gateAgentHarnessTool(name: string): AgentHarnessToolGate {
  if (DENIED_SET.has(name) || !ALLOWED_SET.has(name)) {
    return {
      allowed: false,
      summary: `REFUSED: tool "${name}" is not allowed for the unattended agent. List this under NEEDS HUMAN — do not retry.`,
    };
  }
  return { allowed: true, summary: "ok" };
}

const HARNESS_SYSTEM = `You are BHC MAINFRAME OPS AGENT — an unattended ops manager for BH Contracting (Halifax Regional Municipality).

You run on a schedule. Be concise and action-oriented.

HARD RULES:
1. You may ONLY call tools on the allowlist you were given. Destructive deletes, sending outreach, approving outreach, changing invoices, toggling automations, imports, contracts, and HR writes are FORBIDDEN.
2. If something needs a send, approval, delete, or config change — do NOT call a forbidden tool. Put it under NEEDS HUMAN.
3. Prefer create_task / update_lead_status / remember_knowledge for reversible internal work.
4. Never invent customers, phone numbers, or email addresses.

End your reply with exactly these three sections (markdown headings):

## DID
- bullet list of tools you successfully ran (or "none")

## NEEDS HUMAN
- bullet list of sends/approvals/deletes/config the owner must do (or "none")

## NOTED
- bullet list of observations that need no action (or "none")`;

export type AgentHarnessSweepResult = {
  ok: boolean;
  skipped?: "kill_switch" | "budget" | "no_ai";
  summary: string;
  reply?: string;
  did: string[];
  needsHuman: string[];
  noted: string[];
  toolRuns: Array<{ tool: string; ok: boolean; summary: string; refused?: boolean }>;
  notifiedOwner: boolean;
};

function parseSection(reply: string, heading: string): string[] {
  const re = new RegExp(
    `##\\s*${heading}\\s*([\\s\\S]*?)(?=##\\s*(?:DID|NEEDS HUMAN|NOTED)\\b|$)`,
    "i",
  );
  const m = reply.match(re);
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter((l) => l && !/^none\.?$/i.test(l));
}

export function parseHarnessSections(reply: string): {
  did: string[];
  needsHuman: string[];
  noted: string[];
} {
  return {
    did: parseSection(reply, "DID"),
    needsHuman: parseSection(reply, "NEEDS HUMAN"),
    noted: parseSection(reply, "NOTED"),
  };
}

function buildAllowedTools(): AIToolDefinition[] {
  return AGENT_HARNESS_ALLOWED_TOOLS.map((name) => ({
    name,
    description: `Mainframe tool: ${name}`,
    parameters: { type: "object", properties: {}, additionalProperties: true },
  }));
}

export type AgentHarnessDeps = {
  newId: () => string;
  nowIso: () => string;
  runLoop?: (
    input: Parameters<typeof runAIAgentLoop>[0],
  ) => Promise<AIAgentLoopResult | null>;
  checkBudget?: typeof checkAiBudget;
  recordUsage?: typeof recordAiUsage;
};

/**
 * Run one unattended ops sweep. Safe to call from the automation engine.
 * Mutates `data` only via allowlisted tools + notification/audit.
 */
export async function runAgentOpsSweep(
  data: AppData,
  deps: AgentHarnessDeps,
): Promise<AgentHarnessSweepResult> {
  if (!agentHarnessEnvEnabled()) {
    return {
      ok: true,
      skipped: "kill_switch",
      summary: "Agent harness kill-switch AGENT_HARNESS_ENABLED=0 — skipped.",
      did: [],
      needsHuman: [],
      noted: [],
      toolRuns: [],
      notifiedOwner: false,
    };
  }

  const checkBudget = deps.checkBudget ?? checkAiBudget;
  const recordUsage = deps.recordUsage ?? recordAiUsage;
  const runLoop = deps.runLoop ?? runAIAgentLoop;

  const budget = await checkBudget({ employeeId: AGENT_HARNESS_ACTOR_ID });
  if (!budget.ok) {
    return {
      ok: false,
      skipped: "budget",
      summary: `Agent harness budget blocked: ${budget.reason ?? "daily AI quota reached"}`,
      did: [],
      needsHuman: ["AI daily budget exhausted — raise limits or wait until UTC midnight"],
      noted: [],
      toolRuns: [],
      notifiedOwner: false,
    };
  }

  const ctx: ToolContext = {
    authorId: AGENT_HARNESS_ACTOR_ID,
    newId: deps.newId,
    nowIso: deps.nowIso,
  };

  const toolRuns: AgentHarnessSweepResult["toolRuns"] = [];
  const maxSteps = agentHarnessMaxSteps();

  const userPrompt = [
    "Run a full ops sweep for BH Contracting (HRM).",
    "1) Read CRM summary, store health, automation status, ads, and outreach queues.",
    "2) Create follow-up tasks for anything stale or blocked.",
    "3) Update lead statuses only when clearly warranted by existing data.",
    "4) Anything that requires sending, approving, deleting, or config changes → NEEDS HUMAN.",
    "5) Finish with DID / NEEDS HUMAN / NOTED sections.",
  ].join("\n");

  const ai = await runLoop({
    systemPrompt: HARNESS_SYSTEM,
    contextPrompt: `Actor: ${AGENT_HARNESS_ACTOR_ID}. Allowlisted tools only. HRM focus.`,
    messages: [{ role: "user", content: userPrompt }],
    tools: buildAllowedTools(),
    maxSteps,
    executeTool: async (name, args) => {
      const gate = gateAgentHarnessTool(name);
      if (!gate.allowed) {
        toolRuns.push({ tool: name, ok: false, summary: gate.summary, refused: true });
        return { summary: gate.summary, ok: false };
      }
      const result = executeMainframeTool(
        data,
        name as MainframeToolName,
        args ?? {},
        ctx,
      );
      toolRuns.push({ tool: name, ok: result.ok, summary: result.summary });
      return { summary: result.summary, ok: result.ok };
    },
  });

  if (!ai) {
    return {
      ok: false,
      skipped: "no_ai",
      summary:
        "Agent harness: no AI provider configured (set ANTHROPIC_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY).",
      did: [],
      needsHuman: ["Configure an AI API key before enabling Mainframe ops sweep"],
      noted: [],
      toolRuns,
      notifiedOwner: false,
    };
  }

  await recordUsage({
    provider: "agent-harness",
    employeeId: AGENT_HARNESS_ACTOR_ID,
    estimatedTokens: estimateTokensFromText(userPrompt + (ai.reply ?? "")),
  });

  const sections = parseHarnessSections(ai.reply ?? "");
  const refused = toolRuns.filter((t) => t.refused).length;
  const succeeded = toolRuns.filter((t) => t.ok && !t.refused).length;

  const did =
    sections.did.length > 0
      ? sections.did
      : succeeded
        ? toolRuns.filter((t) => t.ok && !t.refused).map((t) => `${t.tool}: ${t.summary}`)
        : [];
  const needsHuman = [
    ...sections.needsHuman,
    ...toolRuns.filter((t) => t.refused).map((t) => `Refused ${t.tool} — handle manually`),
  ];
  const noted = sections.noted;

  let notifiedOwner = false;
  if (needsHuman.length > 0) {
    enqueueNotification(
      data,
      {
        employeeId: null,
        title: "Mainframe agent needs human",
        body: needsHuman.slice(0, 8).join(" · ").slice(0, 400),
        href: "/admin/automation",
        dedupeKey: `agent-harness-needs-human:${deps.nowIso().slice(0, 13)}`,
      },
      deps.newId,
      deps.nowIso,
    );
    notifiedOwner = true;
  }

  const summary = `Agent ops: ${succeeded} tool(s) ok · ${refused} refused · ${needsHuman.length} need human`;
  audit(data, "agent_ops", summary, deps.newId);

  return {
    ok: true,
    summary,
    reply: ai.reply,
    did,
    needsHuman,
    noted,
    toolRuns,
    notifiedOwner,
  };
}

/** Sanity: every allowed tool exists in MAINFRAME_TOOL_NAMES. */
export function assertHarnessAllowlistValid(): string[] {
  const known = new Set<string>(MAINFRAME_TOOL_NAMES);
  return AGENT_HARNESS_ALLOWED_TOOLS.filter((t) => !known.has(t));
}
