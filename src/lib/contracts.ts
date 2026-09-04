import type { AppData, ContractRecord, Job, Lead } from "./types";
import type { ToolContext } from "./mainframe-tools";

export type ContractMeta = {
  title?: string;
  slug?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  address?: string;
  city?: string;
  contractValue?: number;
  jobType?: "residential" | "commercial";
  jobTitle?: string;
  leadId?: string | null;
  jobId?: string | null;
  notes?: string;
};

export function isValidContractSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,48}$/i.test(slug);
}

export function findContractRecord(data: AppData, slug: string): ContractRecord | undefined {
  return data.contracts.find((c) => c.slug === slug);
}

/** Register or refresh a contract record from metadata and link to CRM job/lead. */
export function syncContractToCrm(
  data: AppData,
  slug: string,
  meta: ContractMeta,
  ctx: ToolContext,
): { contract: ContractRecord; job: Job | null; lead: Lead | null } {
  const stamp = ctx.nowIso();
  const existing = findContractRecord(data, slug);
  let lead: Lead | null = null;
  let job: Job | null = null;

  if (meta.leadId) {
    lead = data.leads.find((l) => l.id === meta.leadId) ?? null;
  }
  if (meta.jobId) {
    job = data.jobs.find((j) => j.id === meta.jobId) ?? null;
  }

  if (!lead && meta.customerName) {
    const name = meta.customerName.trim();
    lead =
      data.leads.find((l) => l.name.toLowerCase() === name.toLowerCase()) ??
      null;
    if (!lead) {
      lead = {
        id: ctx.newId(),
        name,
        phone: meta.customerPhone ?? "(902) 000-0000",
        email: meta.customerEmail ?? "",
        address: meta.address ?? "TBD",
        city: meta.city ?? "Halifax",
        source: "Contract import",
        status: "won",
        jobType: meta.jobType === "commercial" ? "commercial" : "residential",
        notes: meta.notes ?? `Synced from contract /contracts/${slug}`,
        assignedToId: ctx.authorId,
        companyId: null,
        leadScore: 75,
        createdAt: stamp,
        updatedAt: stamp,
      };
      data.leads.unshift(lead);
    }
  }

  if (!job) {
    const title =
      meta.jobTitle?.trim() ||
      meta.title?.trim() ||
      `${slug} contract — ${meta.customerName ?? "Customer"}`;
    job =
      data.jobs.find(
        (j) =>
          j.title.toLowerCase() === title.toLowerCase() ||
          (lead && j.leadId === lead.id),
      ) ?? null;
    if (!job) {
      job = {
        id: ctx.newId(),
        title,
        customerName: meta.customerName ?? lead?.name ?? "TBD",
        address: meta.address ?? lead?.address ?? "TBD",
        jobType: meta.jobType === "commercial" ? "commercial" : "residential",
        status: "scheduled",
        leadId: lead?.id ?? null,
        crewLeadId: "emp-field",
        startDate: stamp.slice(0, 10),
        estimatedValue: Number(meta.contractValue ?? 0),
        contractValue: Number(meta.contractValue ?? 0),
        notes: meta.notes ?? `Imported from /contracts/${slug}`,
        createdAt: stamp,
      };
      data.jobs.unshift(job);
    } else {
      if (meta.contractValue != null) {
        job.contractValue = Number(meta.contractValue);
        job.estimatedValue = Number(meta.contractValue);
      }
      if (lead && !job.leadId) job.leadId = lead.id;
      if (meta.notes) job.notes = meta.notes;
    }
  }

  const fileName = existing?.fileName ?? "index.html";
  const record: ContractRecord = {
    id: existing?.id ?? ctx.newId(),
    slug,
    title: meta.title ?? `${slug} contract`,
    publicPath: `/contracts/${slug}`,
    fileName,
    mimeType: existing?.mimeType ?? "text/html",
    jobId: job?.id ?? null,
    leadId: lead?.id ?? null,
    customerName: meta.customerName ?? job?.customerName ?? "",
    contractValue: Number(meta.contractValue ?? job?.contractValue ?? 0),
    status: existing?.status ?? "active",
    notes: meta.notes ?? "",
    syncedAt: stamp,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  };

  if (existing) {
    Object.assign(existing, record);
  } else {
    data.contracts.unshift(record);
  }

  data.assistantAudit.unshift({
    id: ctx.newId(),
    action: "contract_synced",
    detail: `Contract ${slug} synced — job ${job?.id ?? "n/a"}, lead ${lead?.id ?? "n/a"}`,
    createdAt: stamp,
  });

  return { contract: record, job, lead };
}
