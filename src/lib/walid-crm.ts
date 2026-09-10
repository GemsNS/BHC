/**
 * Ensure the Walid / SOI Trade Uniacke warehouse job exists in CRM.
 * Idempotent — safe to run on seed, reseed, or `npm run bhc -- walid ensure`.
 *
 * Source of truth for commercial terms:
 *   presentations/walid/package/03_Contract/Walid_Siding_Contract.md
 *   presentations/walid/meta.json
 *   src/lib/fuel-travel.ts (WALID_JOB_TRAVEL)
 */

import { WALID_JOB_TRAVEL } from "./fuel-travel";
import type {
  ActivityType,
  AppData,
  Company,
  ContractRecord,
  CrmActivity,
  Deal,
  Job,
  Lead,
} from "./types";

export const WALID_CRM = {
  companyId: "co-soi-trade",
  leadId: "lead-walid",
  jobId: "job-walid",
  dealId: "deal-walid",
  contractId: "ctr-walid",
  contractSlug: "walid",
  activityId: "act-walid-seed",
  day1ProgressIds: ["prog-walid-day1-a", "prog-walid-day1-b"] as const,
  day2ProgressIds: ["prog-walid-day2"] as const,
  day1Date: "2026-09-09",
  day2Date: "2026-09-10",
  /** Day 1 on-site shift (Atlantic) — Christopher & Cameron only. */
  day1ShiftStart: "08:00",
  day1ShiftEnd: "14:00",
  /** Day 2 on-site shift (Atlantic) — Rylee, Christopher & Cameron. */
  day2ShiftStart: "10:30",
  day2ShiftEnd: "18:30",
  crew: [
    { id: "emp-rylee", name: "Rylee", login: "rylee" },
    { id: "emp-chris", name: "Christopher", login: "chris" },
    { id: "emp-cameron-field", name: "Cameron", login: "cameron" },
  ] as const,
  /** Who worked which day (employee ids from `crew`). */
  day1CrewIds: ["emp-chris", "emp-cameron-field"] as const,
  day2CrewIds: ["emp-rylee", "emp-chris", "emp-cameron-field"] as const,
  customerLegalName: "SOI Trade Inc.",
  attention: "Walid Sallam",
  leadDisplayName: "Walid Sallam — SOI Trade Inc.",
  jobTitle: "Uniacke warehouse siding — SOI Trade / Walid Sallam",
  address: "9 Alicia Scott Ave., Mount Uniacke, Nova Scotia B0N 1Z0",
  city: "Mount Uniacke, NS",
  /** Pre-HST: $12,000 siding + $1,000 doors + $1,005.12 fuel/travel */
  contractValue: 14005.12,
  sidingSquares: 30,
  doors: 2,
  presentationPath: "/presentations/walid",
  presentationV2Path: "/presentations/walid/v2",
  presentationV3Path: "/presentations/walid/v3",
  fieldPhotosDay1Dir: "field-photos/walid-day-1",
  fieldPhotosDay2Dir: "field-photos/walid-day-2",
  contractPackageNote:
    "Warehouse extension exterior: ~30 squares charcoal/cedar-tone siding, 2 exterior doors, crew fuel/travel (20 RT Dartmouth↔Uniacke). Presentation: /presentations/walid · 3D model (current Oreo v3): /presentations/walid/v3 · prior Oreo v2: /presentations/walid/v2 · Contract package under presentations/walid/package/03_Contract/.",
} as const;

export type EnsureWalidResult = {
  created: string[];
  updated: string[];
  companyId: string;
  leadId: string;
  jobId: string;
};

function upsertById<T extends { id: string }>(list: T[], row: T): "created" | "updated" {
  const i = list.findIndex((x) => x.id === row.id);
  if (i < 0) {
    list.unshift(row);
    return "created";
  }
  list[i] = { ...list[i], ...row, id: row.id };
  return "updated";
}

/** Insert or refresh Walid company, won lead, scheduled job, deal, and contract record. */
export function ensureWalidInCrm(
  data: AppData,
  opts: { nowIso?: string; authorId?: string } = {},
): EnsureWalidResult {
  const now = opts.nowIso ?? new Date().toISOString();
  const authorId = opts.authorId ?? "emp-admin";
  const created: string[] = [];
  const updated: string[] = [];
  const mark = (label: string, kind: "created" | "updated") => {
    (kind === "created" ? created : updated).push(label);
  };

  const company: Company = {
    id: WALID_CRM.companyId,
    name: WALID_CRM.customerLegalName,
    domain: "",
    industry: "Wholesale / trade",
    phone: "",
    address: WALID_CRM.address,
    city: WALID_CRM.city,
    notes: `Attention: ${WALID_CRM.attention}. Customer contact details TBD — fill when provided. Job site: ${WALID_CRM.address}.`,
    createdAt: data.companies.find((c) => c.id === WALID_CRM.companyId)?.createdAt ?? now,
  };
  mark("company", upsertById(data.companies, company));

  const existingLead = data.leads.find((l) => l.id === WALID_CRM.leadId);
  const lead: Lead = {
    id: WALID_CRM.leadId,
    name: WALID_CRM.leadDisplayName,
    phone: existingLead?.phone?.trim() ? existingLead.phone : "",
    email: existingLead?.email?.trim() ? existingLead.email : "",
    address: WALID_CRM.address,
    city: WALID_CRM.city,
    source: "Presentation / contract",
    status: "won",
    jobType: "commercial",
    notes: [
      WALID_CRM.contractPackageNote,
      `Contract price (pre-HST): $${WALID_CRM.contractValue.toFixed(2)}`,
      `Fuel/travel included: ${WALID_JOB_TRAVEL.includedRoundTrips} RT × ${WALID_JOB_TRAVEL.totalDistanceKm / WALID_JOB_TRAVEL.includedRoundTrips} km = $${WALID_JOB_TRAVEL.includedCost.toFixed(2)}`,
      existingLead?.notes?.includes("Progress:") ? existingLead.notes : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    assignedToId: existingLead?.assignedToId ?? "emp-sales",
    companyId: WALID_CRM.companyId,
    leadScore: 90,
    createdAt: existingLead?.createdAt ?? now,
    updatedAt: now,
  };
  mark("lead", upsertById(data.leads, lead));

  const existingJob = data.jobs.find((j) => j.id === WALID_CRM.jobId);
  const job: Job = {
    id: WALID_CRM.jobId,
    title: WALID_CRM.jobTitle,
    customerName: `${WALID_CRM.customerLegalName} (attn ${WALID_CRM.attention})`,
    address: WALID_CRM.address,
    jobType: "commercial",
    status: existingJob?.status === "completed" || existingJob?.status === "invoiced"
      ? existingJob.status
      : existingJob?.status === "in_progress" || existingJob?.status === "on_hold"
        ? existingJob.status
        : "scheduled",
    leadId: WALID_CRM.leadId,
    crewLeadId: existingJob?.crewLeadId ?? "emp-field",
    startDate: existingJob?.startDate ?? now.slice(0, 10),
    estimatedValue: WALID_CRM.contractValue,
    contractValue: WALID_CRM.contractValue,
    notes: [
      WALID_CRM.contractPackageNote,
      "Payment milestones (pre-HST): mobilization+fuel $4,255.12 · ~50% siding $6,500 · substantial $3,250.",
      "Statutory holdback 10% per NS Builders' Lien Act.",
      existingJob?.notes?.includes("Progress:") ? existingJob.notes : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    createdAt: existingJob?.createdAt ?? now,
    number: existingJob?.number ?? "JOB-WALID-2026",
    portalToken: existingJob?.portalToken ?? null,
    quoteId: existingJob?.quoteId ?? null,
    completedAt: existingJob?.completedAt ?? null,
  };
  mark("job", upsertById(data.jobs, job));

  const existingDeal = data.deals.find((d) => d.id === WALID_CRM.dealId);
  const deal: Deal = {
    id: WALID_CRM.dealId,
    title: "SOI Trade — Uniacke warehouse cladding",
    leadId: WALID_CRM.leadId,
    companyId: WALID_CRM.companyId,
    stage: "closed_won",
    amount: WALID_CRM.contractValue,
    closeDate: existingDeal?.closeDate ?? now.slice(0, 10),
    ownerId: existingDeal?.ownerId ?? "emp-sales",
    notes: `Won commercial cladding package. See job ${WALID_CRM.jobId}.`,
    createdAt: existingDeal?.createdAt ?? now,
    updatedAt: now,
  };
  mark("deal", upsertById(data.deals, deal));

  const existingContract = data.contracts.find(
    (c) => c.id === WALID_CRM.contractId || c.slug === WALID_CRM.contractSlug,
  );
  const contract: ContractRecord = {
    id: existingContract?.id ?? WALID_CRM.contractId,
    slug: WALID_CRM.contractSlug,
    title: "Walid / SOI Trade — Warehouse Extension Siding Agreement",
    publicPath: WALID_CRM.presentationPath,
    fileName: existingContract?.fileName ?? "Walid_Siding_Contract.md",
    mimeType: existingContract?.mimeType ?? "text/markdown",
    jobId: WALID_CRM.jobId,
    leadId: WALID_CRM.leadId,
    customerName: WALID_CRM.leadDisplayName,
    contractValue: WALID_CRM.contractValue,
    status: existingContract?.status ?? "active",
    notes: `Canonical contract MD in presentations/walid/package/03_Contract/. Live presentation ${WALID_CRM.presentationPath} (password-gated). Public 3D Oreo v3: ${WALID_CRM.presentationV3Path} (prior v2: ${WALID_CRM.presentationV2Path}).`,
    syncedAt: now,
    createdAt: existingContract?.createdAt ?? now,
    updatedAt: now,
  };
  if (existingContract) {
    const i = data.contracts.findIndex((c) => c.id === existingContract.id);
    data.contracts[i] = { ...existingContract, ...contract, id: existingContract.id };
    mark("contract", "updated");
  } else {
    data.contracts.unshift(contract);
    mark("contract", "created");
  }

  if (!data.activities.some((a) => a.id === WALID_CRM.activityId)) {
    const activity: CrmActivity = {
      id: WALID_CRM.activityId,
      type: "note" as ActivityType,
      subject: "Walid job loaded into CRM",
      body: `Imported from presentation/contract package. Scope: ${WALID_CRM.sidingSquares} squares + ${WALID_CRM.doors} doors + included fuel/travel. Value $${WALID_CRM.contractValue.toFixed(2)} pre-HST.`,
      relatedType: "job",
      relatedId: WALID_CRM.jobId,
      authorId,
      dueAt: null,
      completedAt: null,
      createdAt: now,
    };
    data.activities.unshift(activity);
    created.push("activity");
  }

  return {
    created,
    updated,
    companyId: WALID_CRM.companyId,
    leadId: WALID_CRM.leadId,
    jobId: WALID_CRM.jobId,
  };
}
