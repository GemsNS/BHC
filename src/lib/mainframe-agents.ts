/**
 * Mainframe multi-agent collaboration — specialist personas that share one CRM tool surface.
 * "Manus" is a design/presentation specialist persona (uses the same LLM provider).
 */

export type MainframeAgentId = "orchestrator" | "crm" | "estimator" | "research" | "design";

export type MainframeAgentDef = {
  id: MainframeAgentId;
  label: string;
  blurb: string;
  systemAddon: string;
};

export const MAINFRAME_AGENTS: MainframeAgentDef[] = [
  {
    id: "orchestrator",
    label: "Orchestrator",
    blurb: "Routes work across specialists and keeps CRM actions coherent.",
    systemAddon:
      "You are the Orchestrator. Prefer concise CRM actions. When a task is clearly specialized, say which agent should own the next step (CRM / Estimator / Research / Design) and still execute tools yourself when possible.",
  },
  {
    id: "crm",
    label: "CRM",
    blurb: "Leads, jobs, invoices, deals, outreach approvals.",
    systemAddon:
      "You are the CRM specialist. Focus on leads, jobs, invoices, deals, tickets, companies, outreach queues, and workflows. Prefer precise tool calls over long prose.",
  },
  {
    id: "estimator",
    label: "Estimator",
    blurb: "Quantities, pricing language, contract linkage.",
    systemAddon:
      "You are the Estimator. Focus on quantities, provisional pricing language, contract register/sync, and field-measurement caveats. Never invent fixed prices as final.",
  },
  {
    id: "research",
    label: "Research",
    blurb: "HRM weather/geo, hunt criteria, knowledge memory.",
    systemAddon:
      "You are Research. Use lookup_hrm, hunt/prospect tools, and knowledge memory. Cite what is approximate vs confirmed.",
  },
  {
    id: "design",
    label: "Design (Manus)",
    blurb: "Façade concepts, presentation packaging, visual honesty.",
    systemAddon:
      "You are the Design / Manus specialist for BH Contracting presentations. Prefer honest visuals (site photos vs concept renders). Do not describe concept renders as finished site photography. Help package customer presentations and call out misleading imagery.",
  },
];

export function getMainframeAgent(id?: string | null): MainframeAgentDef {
  return MAINFRAME_AGENTS.find((a) => a.id === id) ?? MAINFRAME_AGENTS[0];
}

export function composeAgentSystemPrompt(base: string, agentId?: string | null): string {
  const agent = getMainframeAgent(agentId);
  return `${base}

## Active agent: ${agent.label}
${agent.systemAddon}

Multi-agent note: Other specialists may continue this thread. Keep state in CRM tools and memory so teammates can pick up cleanly.`;
}
