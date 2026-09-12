/**
 * Mainframe agent harness — the autonomous ops manager that runs 24/7.
 *
 * Ships disabled (catalog `defaultEnabled: false`). Even when an operator
 * enables the automation in Admin → Automation, `AGENT_HARNESS_ENABLED=0`
 * hard-kills it.
 *
 * How it runs
 *  - The automation engine calls `runAgentOpsSweep` on the agent_ops interval
 *    (AGENT_HARNESS_INTERVAL_MIN overrides the stored interval) and *wakes* it
 *    early when something happened (new qualified ad, prospect reply, inbound
 *    message, failed tick, finished scout scan) — see agent-wake.ts.
 *  - Each run gets a server-built briefing (counts, last tick, last run, open
 *    goals, scout status) so it spends tool calls on work, not on orientation.
 *  - It can search the web (Anthropic web_search server tool), read public
 *    listing pages (fetch_page), push finds into the ad pipeline (ingest_ad),
 *    and direct the own-PC lead scout runner (request_web_scan).
 *
 * Guardrails (enforced in code, not just in the prompt)
 *  - Autonomy tiers (AGENT_AUTONOMY): observe < assist (default) < operate < full.
 *    Deletes, HR writes, imports, and QuickBooks syncs are refused at every tier.
 *    Sends/approvals only open up at operate/full and stay inside outreach policy
 *    (score threshold, daily cap, quiet hours, opt-outs — all enforced downstream).
 *  - Cost guard: checkAiBudget / recordAiUsage under actor emp-mainframe-agent,
 *    AGENT_HARNESS_MAX_STEPS per run, AGENT_HARNESS_MAX_RUNS_PER_DAY per day.
 *  - Output sections DID / NEEDS HUMAN / NOTED → run record + audit + owner
 *    notification when a human is needed.
 */

import {
  checkAiBudget,
  estimateTokensFromText,
  recordAiUsage,
} from "./ai-budget";
import { getAiBudgetLimits } from "./ai-budget-limits";
import {
  getAIStatus,
  runAIAgentLoop,
  type AIAgentLoopInput,
  type AIAgentLoopResult,
  type AIToolDefinition,
} from "./ai-provider";
import {
  agentAutonomyLevel,
  agentIntervalOverrideMinutes,
  agentMaxRunsPerDay,
  agentMinGapMinutes,
  agentRunsToday,
  agentWakeReasons,
  autonomyRank,
  lastAgentRunAt,
} from "./agent-wake";
import {
  AGENT_READ_TOOLS,
  AGENT_TOOL_NAMES,
  buildAgentToolDefinitions,
  executeAgentTool,
  isAgentTool,
  openAgentGoals,
  type AgentToolDeps,
} from "./agent-tools";
import { live } from "./events";
import { scoutStatus } from "./lead-scout";
import { buildMainframeTools } from "./mainframe-agent";
import { audit } from "./mainframe-automations";
import {
  executeMainframeTool,
  MAINFRAME_TOOL_NAMES,
  type MainframeToolName,
  type ToolContext,
} from "./mainframe-tools";
import { enqueueNotification } from "./notifications";
import { sendPolicy } from "./outreach-send";
import type { AgentAutonomyLevel, AgentRunRecord, AppData } from "./types";

export const AGENT_HARNESS_ACTOR_ID = "emp-mainframe-agent";
export const AGENT_RUN_HISTORY_CAP = 50;

export { agentAutonomyLevel } from "./agent-wake";

/* ------------------------------ tool tiers ------------------------------ */

/** Read-only CRM tools — the observe tier. */
export const AGENT_HARNESS_READ_TOOLS: readonly MainframeToolName[] = [
  "get_summary",
  "list_leads",
  "list_jobs",
  "list_invoices",
  "list_deals",
  "list_tickets",
  "list_companies",
  "list_employees",
  "list_activities",
  "list_outreach",
  "list_workflows",
  "list_contracts",
  "search_knowledge",
  "lookup_hrm",
  "automation_status",
  "store_health",
  "list_ads",
  "outreach_status",
  "qb_status",
  "qb_get_pnl",
];

/** Reads + reversible internal writes — the assist tier (default). */
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

/** Added at the operate tier — policy-gated approvals and engine controls. */
export const AGENT_HARNESS_OPERATE_TOOLS: readonly MainframeToolName[] = [
  "approve_outreach",
  "update_outreach",
  "run_workflow",
  "process_sequences",
  "save_criteria_profile",
  "toggle_automation",
  "qb_status",
  "qb_get_pnl",
];

/** Added at the full tier — real sends and money-side edits. */
export const AGENT_HARNESS_FULL_TOOLS: readonly MainframeToolName[] = [
  "send_outreach",
  "update_invoice",
  "register_contract",
  "sync_contract",
];

/** Refused at EVERY tier — irreversible, HR, bulk import, accounting sync. */
export const AGENT_HARNESS_ALWAYS_DENIED: readonly string[] = [
  "delete_lead",
  "delete_job",
  "delete_invoice",
  "delete_deal",
  "delete_ticket",
  "delete_company",
  "delete_activity",
  "delete_outreach",
  "delete_memory",
  "create_employee",
  "update_employee",
  "import_data",
  "purge_synthetic_outreach",
  "run_daily_automations",
  "qb_sync_customer",
  "qb_sync_invoice",
  "qb_sync_payroll_hours",
];

/**
 * What the DEFAULT (assist) tier refuses. Kept as a stable export: it is the
 * list the original harness shipped with and what tests + docs reference.
 */
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

const ALWAYS_DENIED_SET = new Set(AGENT_HARNESS_ALWAYS_DENIED);

/** CRM tools available at a tier (agent tools are added separately). */
export function crmToolsForLevel(level: AgentAutonomyLevel): MainframeToolName[] {
  const set = new Set<MainframeToolName>();
  const add = (list: readonly MainframeToolName[]) => list.forEach((t) => set.add(t));
  add(AGENT_HARNESS_READ_TOOLS);
  if (autonomyRank(level) >= autonomyRank("assist")) add(AGENT_HARNESS_ALLOWED_TOOLS);
  if (autonomyRank(level) >= autonomyRank("operate")) add(AGENT_HARNESS_OPERATE_TOOLS);
  if (autonomyRank(level) >= autonomyRank("full")) add(AGENT_HARNESS_FULL_TOOLS);
  for (const d of AGENT_HARNESS_ALWAYS_DENIED) set.delete(d as MainframeToolName);
  return [...set];
}

/** Agent (web/scout/goal) tools available at a tier. */
export function agentToolsForLevel(level: AgentAutonomyLevel): string[] {
  return level === "observe" ? [...AGENT_READ_TOOLS] : [...AGENT_TOOL_NAMES];
}

export function agentHarnessEnvEnabled(): boolean {
  const v = (process.env.AGENT_HARNESS_ENABLED ?? "0").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function agentHarnessMaxSteps(): number {
  const raw = process.env.AGENT_HARNESS_MAX_STEPS?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 40) return Math.floor(n);
  return Math.max(12, getAiBudgetLimits().maxSteps);
}

/** Anthropic web_search server tool is on unless AGENT_WEB_SEARCH=0. */
export function agentWebSearchEnabled(): boolean {
  const v = (process.env.AGENT_WEB_SEARCH ?? "1").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "off") && getAIStatus().provider === "anthropic";
}

export function agentWebSearchMaxUses(): number {
  const n = Number(process.env.AGENT_WEB_SEARCH_MAX ?? "5");
  return Number.isFinite(n) && n >= 1 && n <= 20 ? Math.floor(n) : 5;
}

export type AgentHarnessToolGate = { allowed: boolean; summary: string };

/**
 * Pure gate used by the execute path + tests — never mutates.
 * `args` lets policy-gated tools (approve_outreach) be checked per call.
 */
export function gateAgentHarnessTool(
  name: string,
  level: AgentAutonomyLevel = agentAutonomyLevel(),
  args: Record<string, unknown> = {},
  data?: AppData,
): AgentHarnessToolGate {
  if (ALWAYS_DENIED_SET.has(name)) {
    return {
      allowed: false,
      summary: `REFUSED: tool "${name}" is never available to the unattended agent (irreversible / HR / import / accounting). List it under NEEDS HUMAN — do not retry.`,
    };
  }
  const crm = new Set<string>(crmToolsForLevel(level));
  const agent = new Set(agentToolsForLevel(level));
  if (!crm.has(name) && !agent.has(name)) {
    return {
      allowed: false,
      summary: `REFUSED: tool "${name}" is not allowed at autonomy level "${level}". List this under NEEDS HUMAN — do not retry.`,
    };
  }
  if (name === "approve_outreach") {
    if (args.all) {
      return { allowed: false, summary: "REFUSED: approve one draft at a time by id; bulk approval needs a human." };
    }
    const id = typeof args.id === "string" ? args.id.trim() : "";
    if (!id) return { allowed: false, summary: "REFUSED: approve_outreach needs a draft id." };
    if (data) {
      const item = data.outreachQueue.find((o) => o.id === id);
      if (!item) return { allowed: false, summary: `REFUSED: outreach draft ${id} not found.` };
      const ad = item.adId ? data.adListings.find((a) => a.id === item.adId) : null;
      const min = sendPolicy().autosendMinScore;
      if (!ad || ad.score < min) {
        return {
          allowed: false,
          summary: `REFUSED: draft ${id} is ${ad ? `for ad score ${ad.score}` : "not tied to a scored ad"}; agent may only approve ad replies scoring ≥ ${min}. List under NEEDS HUMAN.`,
        };
      }
    }
  }
  if (name === "update_outreach" && String(args.status ?? "").toLowerCase() === "sent") {
    return { allowed: false, summary: "REFUSED: never mark outreach sent by hand — only real SMTP/SMS sends do that." };
  }
  if (name === "toggle_automation") {
    const target = `${String(args.id ?? "")} ${String(args.name ?? "")}`.toLowerCase();
    if (/agent|auto-agent-ops|ops sweep/.test(target)) {
      return { allowed: false, summary: "REFUSED: the agent cannot toggle its own automation." };
    }
  }
  return { allowed: true, summary: "ok" };
}

/* ------------------------------- prompt -------------------------------- */

const HARNESS_SYSTEM = `You are BHC MAINFRAME OPS AGENT — the autonomous ops manager for BH Contracting (Halifax Regional Municipality, Nova Scotia). You run around the clock on a schedule and whenever something happens. Be concise and action-oriented.

STANDING MISSION (every run):
1. Keep the lead pipeline full. Find fresh homeowner requests for exterior work (siding, soffit/fascia, decks, windows & doors, exterior trim, building envelope) in HRM: use web_search when available, fetch_page to read listing/search pages on Kijiji, Craigslist, Reddit r/halifax, Facebook Marketplace, HomeStars, Nextdoor, and request_web_scan to have the lead-scout runner scan platforms from a residential IP. Push real finds through ingest_ad (real listing URL required).
2. Make sure every qualified ad has a drafted reply and every reply/inbound message has a follow-up task or a clear next step.
3. Keep operations current: follow-up tasks for stale leads, blocked jobs, unpaid invoices; note engine errors.
4. Escalate anything you cannot or may not do under NEEDS HUMAN.

HARD RULES:
- You may ONLY call tools on the allowlist you were given. Refused tools mean the action needs a human — list it under NEEDS HUMAN, never retry.
- Never invent customers, phone numbers, email addresses, or listing URLs. Only ingest what you actually read on a page or in a search result.
- Never mark outreach as sent; only real sends do that.
- Prefer create_task / update_lead_status / remember_knowledge / set_goal for reversible internal work.
- Do not repeat work already done in the last run (see the briefing). Do not queue a scan that is already queued.

End your reply with exactly these three sections (markdown headings):

## DID
- bullet list of what you actually did (tools that succeeded) (or "none")

## NEEDS HUMAN
- bullet list of sends/approvals/deletes/config the owner must do (or "none")

## NOTED
- bullet list of observations that need no action (or "none")`;

function tierDescription(level: AgentAutonomyLevel): string {
  switch (level) {
    case "observe":
      return "OBSERVE — read-only. You may read the CRM and the web and report; every write goes under NEEDS HUMAN.";
    case "assist":
      return "ASSIST — reads plus reversible internal writes (tasks, lead status, notes, goals, ingesting ads, queueing scans). Approvals and sends go under NEEDS HUMAN.";
    case "operate":
      return `OPERATE — everything in ASSIST plus approving ad-reply drafts one at a time when the ad scores ≥ ${sendPolicy().autosendMinScore}, running workflows/sequences, and toggling other automations. Real sends still happen only through the outreach_send automation or a human.`;
    case "full":
      return "FULL — everything in OPERATE plus send_outreach (respects opt-outs, daily cap, quiet hours), invoice edits, and contract sync. Deletes, HR, imports, and accounting sync remain human-only.";
  }
}

/** Server-built orientation so the model does not burn steps on discovery. */
export function buildAgentBriefing(
  data: AppData,
  opts: { now?: number; wakeReasons?: string[]; level?: AgentAutonomyLevel; trigger?: string } = {},
): string {
  const now = opts.now ?? Date.now();
  const level = opts.level ?? agentAutonomyLevel();
  const dayAgo = now - 24 * 60 * 60_000;
  const ads = data.adListings;
  const count = (fn: (a: (typeof ads)[number]) => boolean) => ads.filter(fn).length;
  const pending = data.outreachQueue.filter((o) => o.status === "pending_approval").length;
  const approved = data.outreachQueue.filter((o) => o.status === "approved").length;
  const inbox = data.messages.filter((m) => m.direction === "in" && !m.readAt).length;
  const overdue = data.activities.filter(
    (a) => !a.completedAt && a.dueAt && new Date(a.dueAt).getTime() < now,
  ).length;
  const unpaid = data.invoices.filter((i) => i.status === "sent").length;
  const activeJobs = data.jobs.filter((j) => j.status === "in_progress" || j.status === "scheduled").length;
  const newLeads24h = data.leads.filter((l) => new Date(l.createdAt).getTime() > dayAgo).length;

  const lastTick = data.automationRuns[0];
  const lastRun = (data.agentRuns ?? []).find((r) => !r.skipped);
  const goals = openAgentGoals(data);
  const scout = scoutStatus(data, now);
  const lines: string[] = [];

  lines.push(`Autonomy: ${tierDescription(level)}`);
  lines.push(`Trigger: ${opts.trigger ?? "schedule"}${opts.wakeReasons?.length ? ` — ${opts.wakeReasons.join("; ")}` : ""}`);
  lines.push(
    `Pipeline: ${count((a) => a.status === "new")} new ads · ${count((a) => a.status === "qualified")} qualified (no draft yet) · ${count((a) => a.status === "drafted")} drafted · ${count((a) => a.status === "sent")} sent · ${count((a) => a.status === "replied")} replied · ${count((a) => new Date(a.fetchedAt).getTime() > dayAgo)} fetched in last 24 h.`,
  );
  lines.push(
    `Outreach: ${pending} pending approval · ${approved} approved (will send on the next tick) · inbox ${inbox} unread · ${newLeads24h} new lead(s) in 24 h.`,
  );
  lines.push(`Ops: ${overdue} overdue task(s) · ${unpaid} unpaid sent invoice(s) · ${activeJobs} active job(s).`);
  if (lastTick) {
    lines.push(
      `Last engine tick ${lastTick.finishedAt.slice(0, 16)}: ${lastTick.results.length} result(s), ${lastTick.errors.length} error(s)${lastTick.errors.length ? ` — ${lastTick.errors.slice(0, 2).map((e) => e.slice(0, 100)).join(" | ")}` : ""}.`,
    );
  }
  if (lastRun) {
    lines.push(
      `Last agent run ${lastRun.finishedAt.slice(0, 16)} (${lastRun.trigger}): DID ${lastRun.did.slice(0, 4).join("; ") || "none"} · NEEDS HUMAN ${lastRun.needsHuman.slice(0, 4).join("; ") || "none"}.`,
    );
  } else {
    lines.push("Last agent run: none yet — this is the first run.");
  }
  lines.push(
    goals.length
      ? `Open goals: ${goals.map((g) => `[${g.id.slice(0, 8)}] ${g.content}`).join("; ")}`
      : "Open goals: none (set_goal to carry work across runs).",
  );
  lines.push(
    `Lead scout: ${scout.onlineRunners} runner(s) online of ${scout.runners.length} · ${scout.queued} queued · ${scout.running} running · ${scout.doneToday} done today${scout.recent[0] ? ` · latest ${scout.recent[0].platform} "${scout.recent[0].query}" ${scout.recent[0].status}` : ""}.${scout.onlineRunners ? "" : " (No runner online — request_web_scan still queues; fetch_page and web_search work from the server.)"}`,
  );
  const known = ads.slice(0, 30).map((a) => a.url).filter(Boolean);
  if (known.length) lines.push(`Already known listing URLs (skip): ${known.join(", ")}`);
  return lines.join("\n");
}

/* -------------------------------- result -------------------------------- */

export type AgentHarnessSweepResult = {
  ok: boolean;
  skipped?: "kill_switch" | "budget" | "no_ai" | "run_cap";
  summary: string;
  reply?: string;
  did: string[];
  needsHuman: string[];
  noted: string[];
  toolRuns: Array<{ tool: string; ok: boolean; summary: string; refused?: boolean }>;
  notifiedOwner: boolean;
  record: AgentRunRecord | null;
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

/** Real schemas for the tier's tools (CRM + agent). */
export function buildHarnessTools(level: AgentAutonomyLevel = agentAutonomyLevel()): AIToolDefinition[] {
  const crm = new Set<string>(crmToolsForLevel(level));
  const agent = new Set(agentToolsForLevel(level));
  const crmDefs = buildMainframeTools().filter((t) => crm.has(t.name));
  const agentDefs = buildAgentToolDefinitions().filter((t) => agent.has(t.name));
  return [...crmDefs, ...agentDefs];
}

export function buildServerTools(): Array<Record<string, unknown>> {
  if (!agentWebSearchEnabled()) return [];
  return [
    {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: agentWebSearchMaxUses(),
      user_location: {
        type: "approximate",
        city: "Halifax",
        region: "Nova Scotia",
        country: "CA",
        timezone: "America/Halifax",
      },
    },
  ];
}

export type AgentHarnessDeps = {
  newId: () => string;
  nowIso: () => string;
  runLoop?: (input: AIAgentLoopInput) => Promise<AIAgentLoopResult | null>;
  checkBudget?: typeof checkAiBudget;
  recordUsage?: typeof recordAiUsage;
  /** Agent tool I/O (fetcher, ai on/off) — tests inject fakes */
  tools?: AgentToolDeps;
  level?: AgentAutonomyLevel;
};

export type AgentHarnessRunOptions = {
  trigger?: AgentRunRecord["trigger"];
  wakeReasons?: string[];
  now?: number;
};

function recordRun(
  data: AppData,
  deps: AgentHarnessDeps,
  input: Omit<AgentRunRecord, "id" | "finishedAt" | "durationMs">,
  startedMs: number,
): AgentRunRecord {
  const finishedMs = Date.now();
  const rec: AgentRunRecord = {
    ...input,
    id: deps.newId(),
    finishedAt: new Date(Math.max(finishedMs, startedMs)).toISOString(),
    durationMs: Math.max(0, finishedMs - startedMs),
  };
  if (!Array.isArray(data.agentRuns)) data.agentRuns = [];
  data.agentRuns.unshift(rec);
  if (data.agentRuns.length > AGENT_RUN_HISTORY_CAP) data.agentRuns.length = AGENT_RUN_HISTORY_CAP;
  return rec;
}

/**
 * Run one unattended agent sweep. Safe to call from the automation engine.
 * Mutates `data` only via allowlisted tools + run record / notification / audit.
 */
export async function runAgentOpsSweep(
  data: AppData,
  deps: AgentHarnessDeps,
  opts: AgentHarnessRunOptions = {},
): Promise<AgentHarnessSweepResult> {
  const startedMs = opts.now ?? Date.now();
  const startedIso = new Date(startedMs).toISOString();
  const level = deps.level ?? agentAutonomyLevel();
  const trigger = opts.trigger ?? "schedule";
  const wakeReasons = opts.wakeReasons ?? [];
  const empty = {
    did: [] as string[],
    needsHuman: [] as string[],
    noted: [] as string[],
    toolRuns: [] as AgentHarnessSweepResult["toolRuns"],
    notifiedOwner: false,
  };

  if (!agentHarnessEnvEnabled()) {
    return {
      ok: true,
      skipped: "kill_switch",
      summary: "Agent harness kill-switch AGENT_HARNESS_ENABLED=0 — skipped.",
      ...empty,
      record: null,
    };
  }

  const runsToday = agentRunsToday(data, startedMs);
  const maxRuns = agentMaxRunsPerDay();
  if (runsToday >= maxRuns) {
    const summary = `Agent harness: daily run cap reached (${runsToday}/${maxRuns}) — skipped until UTC midnight.`;
    const record = recordRun(
      data,
      deps,
      { trigger, autonomy: level, startedAt: startedIso, skipped: "run_cap", ...empty, wakeReasons, webSearches: 0, estimatedTokens: 0, error: null },
      startedMs,
    );
    return { ok: false, skipped: "run_cap", summary, ...empty, needsHuman: [summary], record };
  }

  const checkBudget = deps.checkBudget ?? checkAiBudget;
  const recordUsage = deps.recordUsage ?? recordAiUsage;
  const runLoop = deps.runLoop ?? runAIAgentLoop;

  const budget = await checkBudget({ employeeId: AGENT_HARNESS_ACTOR_ID });
  if (!budget.ok) {
    const summary = `Agent harness budget blocked: ${budget.reason ?? "daily AI quota reached"}`;
    const record = recordRun(
      data,
      deps,
      { trigger, autonomy: level, startedAt: startedIso, skipped: "budget", ...empty, wakeReasons, webSearches: 0, estimatedTokens: 0, error: summary },
      startedMs,
    );
    return {
      ok: false,
      skipped: "budget",
      summary,
      ...empty,
      needsHuman: ["AI daily budget exhausted — raise limits or wait until UTC midnight"],
      record,
    };
  }

  const ctx: ToolContext = {
    authorId: AGENT_HARNESS_ACTOR_ID,
    newId: deps.newId,
    nowIso: deps.nowIso,
  };
  const toolDeps: AgentToolDeps = { ...(deps.tools ?? {}), now: deps.tools?.now ?? startedMs };

  const toolRuns: AgentHarnessSweepResult["toolRuns"] = [];
  const maxSteps = agentHarnessMaxSteps();
  const briefing = buildAgentBriefing(data, { now: startedMs, wakeReasons, level, trigger });

  const userPrompt = [
    `Run an ops sweep for BH Contracting (HRM). Trigger: ${trigger}.`,
    "1) Read the briefing below; only call list/status tools for details you actually need.",
    "2) Hunt for new homeowner job requests (web_search / fetch_page / request_web_scan) and ingest_ad the real ones.",
    "3) Make sure qualified ads have drafts and replies/inbound messages have next steps (create_task).",
    "4) Update lead statuses only when clearly warranted by existing data. Keep goals current.",
    "5) Anything that requires a send, approval, delete, or config change you are not allowed to do → NEEDS HUMAN.",
    "6) Finish with DID / NEEDS HUMAN / NOTED sections.",
    "",
    "BRIEFING",
    briefing,
  ].join("\n");

  let ai: AIAgentLoopResult | null = null;
  let loopError: string | null = null;
  try {
    ai = await runLoop({
      systemPrompt: HARNESS_SYSTEM,
      contextPrompt: `Actor: ${AGENT_HARNESS_ACTOR_ID}. Allowlisted tools only. Autonomy level: ${level}. HRM focus. Time now: ${startedIso}.`,
      messages: [{ role: "user", content: userPrompt }],
      tools: buildHarnessTools(level),
      serverTools: buildServerTools(),
      maxSteps,
      executeTool: async (name, args) => {
        const gate = gateAgentHarnessTool(name, level, args ?? {}, data);
        if (!gate.allowed) {
          toolRuns.push({ tool: name, ok: false, summary: gate.summary, refused: true });
          return { summary: gate.summary, ok: false };
        }
        try {
          const result = isAgentTool(name)
            ? await executeAgentTool(data, name, args ?? {}, ctx, toolDeps)
            : executeMainframeTool(data, name as MainframeToolName, args ?? {}, ctx);
          toolRuns.push({ tool: name, ok: result.ok, summary: result.summary.slice(0, 600) });
          return { summary: result.summary, ok: result.ok };
        } catch (err) {
          const msg = `Tool ${name} threw: ${err instanceof Error ? err.message : String(err)}`;
          toolRuns.push({ tool: name, ok: false, summary: msg });
          return { summary: msg, ok: false };
        }
      },
    });
  } catch (err) {
    loopError = err instanceof Error ? err.message : String(err);
  }

  if (!ai) {
    const summary = loopError
      ? `Agent harness: AI loop failed — ${loopError}`
      : "Agent harness: no AI provider configured (set ANTHROPIC_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY).";
    const record = recordRun(
      data,
      deps,
      {
        trigger,
        autonomy: level,
        startedAt: startedIso,
        skipped: loopError ? null : "no_ai",
        did: [],
        needsHuman: [loopError ? "Agent AI loop failed — check provider status" : "Configure an AI API key before enabling Mainframe ops sweep"],
        noted: [],
        toolRuns,
        wakeReasons,
        webSearches: 0,
        estimatedTokens: 0,
        error: summary,
      },
      startedMs,
    );
    live.error("ai", "Agent run failed", summary.slice(0, 160));
    return {
      ok: false,
      skipped: loopError ? undefined : "no_ai",
      summary,
      did: [],
      needsHuman: record.needsHuman,
      noted: [],
      toolRuns,
      notifiedOwner: false,
      record,
    };
  }

  const estimatedTokens = estimateTokensFromText(userPrompt + (ai.reply ?? "") + toolRuns.map((t) => t.summary).join(""));
  await recordUsage({
    provider: "agent-harness",
    employeeId: AGENT_HARNESS_ACTOR_ID,
    estimatedTokens,
  });

  const sections = parseHarnessSections(ai.reply ?? "");
  const refused = toolRuns.filter((t) => t.refused).length;
  const succeeded = toolRuns.filter((t) => t.ok && !t.refused).length;

  const did =
    sections.did.length > 0
      ? sections.did
      : succeeded
        ? toolRuns.filter((t) => t.ok && !t.refused).map((t) => `${t.tool}: ${t.summary.slice(0, 140)}`)
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

  const webSearches = ai.webSearches ?? 0;
  const summary = `Agent ops (${trigger}, ${level}): ${succeeded} tool(s) ok · ${refused} refused · ${webSearches} web search(es) · ${needsHuman.length} need human`;
  audit(data, "agent_ops", summary, deps.newId);
  const record = recordRun(
    data,
    deps,
    {
      trigger,
      autonomy: level,
      startedAt: startedIso,
      skipped: null,
      did,
      needsHuman,
      noted,
      toolRuns,
      wakeReasons,
      webSearches,
      estimatedTokens,
      error: null,
    },
    startedMs,
  );
  live.ai(`Agent run (${trigger})`, `${did.length} did · ${needsHuman.length} need human · ${succeeded} tools · ${webSearches} searches`);

  return {
    ok: true,
    summary,
    reply: ai.reply,
    did,
    needsHuman,
    noted,
    toolRuns,
    notifiedOwner,
    record,
  };
}

/* -------------------------------- status -------------------------------- */

export type AgentRuntimeStatus = {
  envEnabled: boolean;
  automationEnabled: boolean;
  autonomy: AgentAutonomyLevel;
  provider: string;
  model: string | null;
  webSearch: boolean;
  maxSteps: number;
  intervalMin: number | null;
  minGapMin: number;
  runsToday: number;
  maxRunsPerDay: number;
  lastRunAt: string | null;
  lastRun: AgentRunRecord | null;
  wakeReasons: string[];
  openGoals: number;
  crmTools: number;
  agentTools: number;
};

/** One-shot status for the API / UI / CLI (pure). */
export function agentRuntimeStatus(data: AppData, now = Date.now()): AgentRuntimeStatus {
  const auto = data.assistantAutomations.find((a) => a.action === "agent_ops");
  const level = agentAutonomyLevel();
  const ai = getAIStatus();
  const lastRunAt = lastAgentRunAt(data);
  return {
    envEnabled: agentHarnessEnvEnabled(),
    automationEnabled: Boolean(auto?.enabled),
    autonomy: level,
    provider: ai.provider,
    model: ai.model,
    webSearch: agentWebSearchEnabled(),
    maxSteps: agentHarnessMaxSteps(),
    intervalMin: agentIntervalOverrideMinutes() ?? auto?.intervalMinutes ?? null,
    minGapMin: agentMinGapMinutes(),
    runsToday: agentRunsToday(data, now),
    maxRunsPerDay: agentMaxRunsPerDay(),
    lastRunAt,
    lastRun: (data.agentRuns ?? [])[0] ?? null,
    wakeReasons: agentWakeReasons(data, lastRunAt, now),
    openGoals: openAgentGoals(data).length,
    crmTools: crmToolsForLevel(level).length,
    agentTools: agentToolsForLevel(level).length,
  };
}

/** Sanity: every allowed tool exists in MAINFRAME_TOOL_NAMES. */
export function assertHarnessAllowlistValid(): string[] {
  const known = new Set<string>(MAINFRAME_TOOL_NAMES);
  const all = [
    ...AGENT_HARNESS_READ_TOOLS,
    ...AGENT_HARNESS_ALLOWED_TOOLS,
    ...AGENT_HARNESS_OPERATE_TOOLS,
    ...AGENT_HARNESS_FULL_TOOLS,
  ];
  return [...new Set(all)].filter((t) => !known.has(t));
}
