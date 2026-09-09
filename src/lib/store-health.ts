import type { AppData } from "./types";
import {
  isJunkAdTitle,
  isRealHttpUrl,
  looksFabricatedProspect,
} from "./outreach-guard";

/**
 * Pure integrity report for an `AppData` document. Works on the server
 * (data/store.json) and in the browser (localStorage demo).
 */

export type StoreHealthIssue = {
  level: "warn" | "error";
  code: string;
  message: string;
  count?: number;
};

export type StoreHealthReport = {
  ok: boolean;
  approxBytes: number;
  approxMB: number;
  counts: Record<string, number>;
  issues: StoreHealthIssue[];
  photoDataUrls: number;
};

const COLLECTIONS: Array<keyof AppData> = [
  "employees",
  "leads",
  "jobs",
  "deals",
  "companies",
  "activities",
  "tickets",
  "invoices",
  "shifts",
  "timeEntries",
  "knocks",
  "zones",
  "knockTerritories",
  "knockTodos",
  "knockProposals",
  "inventory",
  "tools",
  "toolCheckouts",
  "damageReports",
  "jobProgress",
  "vehicles",
  "fuelLogs",
  "materials",
  "workflows",
  "workflowRuns",
  "sequences",
  "sequenceEnrollments",
  "outreachQueue",
  "webhookEndpoints",
  "webhookDeliveries",
  "notifications",
  "assistantAutomations",
  "assistantAudit",
  "assistantMemory",
  "automationRuns",
  "contracts",
  "adSources",
  "adListings",
  "optOuts",
  "quotes",
  "documents",
  "payments",
  "messages",
];

export function storeHealth(data: AppData): StoreHealthReport {
  const issues: StoreHealthIssue[] = [];
  const counts: Record<string, number> = {};
  for (const key of COLLECTIONS) {
    const value = data[key];
    counts[key] = Array.isArray(value) ? value.length : 0;
  }

  const json = JSON.stringify(data);
  const approxBytes = json.length;
  const approxMB = Math.round((approxBytes / 1_048_576) * 100) / 100;

  const employeeIds = new Set(data.employees.map((e) => e.id));
  const leadIds = new Set(data.leads.map((l) => l.id));
  const jobIds = new Set(data.jobs.map((j) => j.id));
  const endpointIds = new Set(data.webhookEndpoints.map((e) => e.id));

  const admins = data.employees.filter((e) => e.active && e.role === "admin");
  if (!admins.length) {
    issues.push({ level: "error", code: "no_admin", message: "No active admin account." });
  }
  const noPassword = data.employees.filter(
    (e) => e.active && !e.passwordHash && !e.hasPassword,
  ).length;
  if (noPassword) {
    issues.push({
      level: "warn",
      code: "bootstrap_pins",
      message: `${noPassword} active account(s) still on bootstrap PIN — no password set.`,
      count: noPassword,
    });
  }

  const danglingLeadAssignee = data.leads.filter(
    (l) => l.assignedToId && !employeeIds.has(l.assignedToId),
  ).length;
  if (danglingLeadAssignee) {
    issues.push({
      level: "warn",
      code: "lead_assignee_missing",
      message: `${danglingLeadAssignee} lead(s) assigned to an employee that no longer exists.`,
      count: danglingLeadAssignee,
    });
  }

  const danglingJobLead = data.jobs.filter((j) => j.leadId && !leadIds.has(j.leadId)).length;
  if (danglingJobLead) {
    issues.push({
      level: "warn",
      code: "job_lead_missing",
      message: `${danglingJobLead} job(s) reference a deleted lead.`,
      count: danglingJobLead,
    });
  }

  const danglingInvoiceJob = data.invoices.filter((i) => !jobIds.has(i.jobId)).length;
  if (danglingInvoiceJob) {
    issues.push({
      level: "error",
      code: "invoice_job_missing",
      message: `${danglingInvoiceJob} invoice(s) reference a job that no longer exists.`,
      count: danglingInvoiceJob,
    });
  }

  const orphanDeliveries = data.webhookDeliveries.filter(
    (d) => !endpointIds.has(d.endpointId),
  ).length;
  if (orphanDeliveries) {
    issues.push({
      level: "warn",
      code: "webhook_endpoint_missing",
      message: `${orphanDeliveries} webhook deliver(ies) belong to a removed endpoint.`,
      count: orphanDeliveries,
    });
  }

  const photoDataUrls =
    data.jobProgress.reduce((s, p) => s + p.imageDataUrls.length, 0) +
    data.damageReports.reduce((s, d) => s + d.imageDataUrls.length, 0) +
    data.knockProposals.filter((p) => p.signatureDataUrl).length;
  if (approxMB > 25) {
    issues.push({
      level: "warn",
      code: "store_large",
      message: `Store is ${approxMB} MB (mostly inline photos). Consider archiving old progress photos.`,
    });
  }

  const duplicateLogins = new Map<string, number>();
  for (const e of data.employees) {
    const k = e.login.toLowerCase();
    duplicateLogins.set(k, (duplicateLogins.get(k) ?? 0) + 1);
  }
  const dupes = [...duplicateLogins.values()].filter((n) => n > 1).length;
  if (dupes) {
    issues.push({
      level: "error",
      code: "duplicate_logins",
      message: `${dupes} login name(s) are used by more than one employee.`,
      count: dupes,
    });
  }

  const syntheticOutreach = data.outreachQueue.filter(
    (o) =>
      o.status !== "cancelled" &&
      o.status !== "sent" &&
      (o.id.startsWith("out-region-") ||
        looksFabricatedProspect({
          name: o.prospectName,
          email: o.prospectEmail,
          phone: o.prospectPhone,
        })),
  ).length;
  if (syntheticOutreach) {
    issues.push({
      level: "warn",
      code: "synthetic_outreach",
      message: `${syntheticOutreach} outreach draft(s) look fabricated (hardcoded/demo contacts). Run purge_synthetic_outreach or: npm run bhc -- ads purge-fake`,
      count: syntheticOutreach,
    });
  }
  const junkAds = data.adListings.filter(
    (a) => isJunkAdTitle(a.title) && !isRealHttpUrl(a.url),
  ).length;
  if (junkAds) {
    issues.push({
      level: "warn",
      code: "junk_ad_listings",
      message: `${junkAds} ad listing(s) look like search-result digests with no listing URL.`,
      count: junkAds,
    });
  }

  return {
    ok: !issues.some((i) => i.level === "error"),
    approxBytes,
    approxMB,
    counts,
    issues,
    photoDataUrls,
  };
}
