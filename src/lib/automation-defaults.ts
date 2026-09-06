import type {
  AssistantDailyAutomation,
  AutomationActionName,
  WorkflowDefinition,
} from "./types";

/**
 * Catalog of everything the automation engine can run unattended.
 *
 * `intervalMinutes` automations run every N minutes (on each scheduler tick
 * once the interval has elapsed). Daily automations run once per day at or
 * after `runHour` (local server time).
 */
export type AutomationCatalogEntry = {
  id: string;
  action: AutomationActionName;
  name: string;
  description: string;
  runHour: number;
  intervalMinutes?: number;
  /** Enabled when first added to a store */
  defaultEnabled: boolean;
  /** Needs a Node host (filesystem / outbound network) */
  serverOnly?: boolean;
};

export const AUTOMATION_CATALOG: AutomationCatalogEntry[] = [
  {
    id: "auto-pipeline",
    action: "pipeline_scan",
    name: "Morning pipeline scan",
    description: "Create follow-up tasks for leads that have gone stale (3+ days without movement).",
    runHour: 7,
    defaultEnabled: true,
  },
  {
    id: "auto-task-reminders",
    action: "task_reminders",
    name: "Task & appointment reminders",
    description: "Push in-app reminders for knocker to-dos and CRM tasks that are due or overdue.",
    runHour: 0,
    intervalMinutes: 15,
    defaultEnabled: true,
  },
  {
    id: "auto-sequences",
    action: "process_sequences",
    name: "Sales sequence steps",
    description: "Advance drip sequences — log the due email/call/task step for each enrolled lead.",
    runHour: 0,
    intervalMinutes: 60,
    defaultEnabled: true,
  },
  {
    id: "auto-invoice-followup",
    action: "invoice_followup",
    name: "Invoice follow-up",
    description: "Flag sent invoices past the payment window and drafts that were never sent.",
    runHour: 8,
    defaultEnabled: true,
  },
  {
    id: "auto-job-health",
    action: "job_health",
    name: "Job health check",
    description: "Catch in-progress jobs with no site update, completed jobs with no invoice, and missed start dates.",
    runHour: 8,
    defaultEnabled: true,
  },
  {
    id: "auto-inventory",
    action: "inventory_reorder",
    name: "Inventory reorder alerts",
    description: "Alert when stock on hand falls to or below its reorder level.",
    runHour: 6,
    defaultEnabled: true,
  },
  {
    id: "auto-tools",
    action: "tool_overdue",
    name: "Tool checkout overdue",
    description: "Remind crew when a tool has been checked out longer than the allowed window.",
    runHour: 9,
    defaultEnabled: true,
  },
  {
    id: "auto-damage",
    action: "damage_escalation",
    name: "Damage escalation",
    description: "Escalate high/critical damage reports still unresolved after 24 hours.",
    runHour: 9,
    defaultEnabled: true,
  },
  {
    id: "auto-fleet",
    action: "fleet_check",
    name: "Fleet check",
    description: "Flag vehicles in maintenance and trucks with stale location pings.",
    runHour: 7,
    defaultEnabled: true,
  },
  {
    id: "auto-digest",
    action: "daily_digest",
    name: "Daily ops digest",
    description: "One morning summary: new leads, open shifts, unpaid invoices, low stock, overdue tasks.",
    runHour: 7,
    defaultEnabled: true,
  },
  {
    id: "auto-webhook-retry",
    action: "webhook_retry",
    name: "Webhook retry",
    description: "Re-deliver failed or queued webhooks with exponential backoff (max 5 attempts).",
    runHour: 0,
    intervalMinutes: 15,
    defaultEnabled: true,
    serverOnly: true,
  },
  {
    id: "auto-backup",
    action: "store_backup",
    name: "Nightly store backup",
    description: "Snapshot data/store.json into data/backups and prune old copies.",
    runHour: 2,
    defaultEnabled: true,
    serverOnly: true,
  },
  {
    id: "auto-ad-ingest",
    action: "ad_ingest",
    name: "Job-ad watch",
    description: "Pull new 'need a contractor' ads from your sources (RSS, alert mailbox, webhooks), triage them with AI, create leads and draft replies.",
    runHour: 0,
    intervalMinutes: 15,
    defaultEnabled: true,
    serverOnly: true,
  },
  {
    id: "auto-outreach-send",
    action: "outreach_send",
    name: "Send approved outreach",
    description: "Email/text every approved reply (respects daily cap and SMS quiet hours). Drafts waiting for approval are never sent.",
    runHour: 0,
    intervalMinutes: 15,
    defaultEnabled: true,
    serverOnly: true,
  },
  {
    id: "auto-outreach-followup",
    action: "outreach_followup",
    name: "Outreach follow-up",
    description: "Draft one polite follow-up for ad replies that got no answer after a few days.",
    runHour: 9,
    defaultEnabled: true,
  },
  {
    id: "auto-prospects",
    action: "prospect_hunt",
    name: "Prospect hunt",
    description: "Queue outreach drafts (pending approval) for leads that match the hunt profile.",
    runHour: 10,
    defaultEnabled: false,
  },
  {
    id: "auto-outreach-digest",
    action: "outreach_digest",
    name: "Outreach digest",
    description: "Summarize outreach drafts waiting for approval.",
    runHour: 16,
    defaultEnabled: false,
  },
];

export function catalogEntry(action: AutomationActionName): AutomationCatalogEntry | undefined {
  return AUTOMATION_CATALOG.find((c) => c.action === action);
}

/**
 * Additive migration: make sure every catalog automation exists in the store.
 * Existing entries (including the operator's enabled/disabled choices) are kept.
 */
export function ensureDefaultAutomations(
  existing: AssistantDailyAutomation[],
): AssistantDailyAutomation[] {
  const byAction = new Set(existing.map((a) => a.action));
  const byId = new Set(existing.map((a) => a.id));
  let changed = false;

  // Backfill interval metadata on records created before the catalog existed
  const merged = existing.map((a) => {
    const entry = catalogEntry(a.action);
    if (entry?.intervalMinutes && a.intervalMinutes == null) {
      changed = true;
      return { ...a, intervalMinutes: entry.intervalMinutes };
    }
    return a;
  });

  const additions: AssistantDailyAutomation[] = [];
  for (const entry of AUTOMATION_CATALOG) {
    if (byAction.has(entry.action) || byId.has(entry.id)) continue;
    additions.push({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      enabled: entry.defaultEnabled,
      runHour: entry.runHour,
      ...(entry.intervalMinutes ? { intervalMinutes: entry.intervalMinutes } : {}),
      action: entry.action,
      lastRunAt: null,
    });
  }
  if (!additions.length && !changed) return existing;
  return [...merged, ...additions];
}

/**
 * Workflow templates for the new triggers. They ship **disabled** so a deploy
 * never starts creating jobs or invoices until an operator turns them on in
 * Sales → Automation (or the Automation hub).
 */
export function buildWorkflowTemplates(now: string): WorkflowDefinition[] {
  return [
    {
      id: "wf-lead-won-job",
      name: "Lead won → create job",
      description: "When a lead is marked won, open a scheduled job and notify the office.",
      enabled: false,
      trigger: "lead_status_changed",
      triggerConfig: { status: "won" },
      actions: [
        { type: "create_job_from_lead", config: {} },
        {
          type: "create_notification",
          config: { title: "New job from won lead", href: "/admin/jobs" },
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "wf-job-completed-invoice",
      name: "Job completed → draft invoice",
      description: "When a job is completed, draft the invoice and remind the office to review it.",
      enabled: false,
      trigger: "job_status_changed",
      triggerConfig: { status: "completed" },
      actions: [
        { type: "create_invoice_draft", config: {} },
        {
          type: "create_notification",
          config: { title: "Invoice draft ready for review", href: "/admin/invoices" },
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "wf-damage-critical",
      name: "Critical damage → alert managers",
      description: "Notify the office immediately when a critical damage report is filed.",
      enabled: false,
      trigger: "damage_reported",
      triggerConfig: { severity: "critical" },
      actions: [
        {
          type: "create_notification",
          config: { title: "Critical damage reported", href: "/admin/damage" },
        },
        { type: "send_webhook", config: { event: "damage.reported" } },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "wf-proposal-signed",
      name: "Proposal signed → qualify lead + task",
      description: "When a knocker proposal is signed, create a scheduling task for the office.",
      enabled: false,
      trigger: "proposal_signed",
      triggerConfig: {},
      actions: [
        {
          type: "create_task",
          config: { subject: "Schedule signed proposal", dueDays: 1 },
        },
        {
          type: "create_notification",
          config: { title: "Proposal signed at the door", href: "/admin/knocker" },
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function ensureWorkflowTemplates(
  existing: WorkflowDefinition[],
  now: string,
): WorkflowDefinition[] {
  const ids = new Set(existing.map((w) => w.id));
  const additions = buildWorkflowTemplates(now).filter((t) => !ids.has(t.id));
  return additions.length ? [...existing, ...additions] : existing;
}
