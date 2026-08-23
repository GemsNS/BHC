import type { AppData, Lead, OutreachQueueItem } from "./types";

/** Demo prospect templates matched by job type / city */
const PROSPECT_TEMPLATES = {
  residential: [
    {
      name: "Coastal Homeowners Assoc.",
      email: "board@coastalhoa.org",
      phone: "(555) 770-2200",
      subject: "Exterior upgrades for coastal homes",
    },
    {
      name: "Driftwood Neighborhood Group",
      email: "info@driftwoodgroup.org",
      phone: "(555) 770-3300",
      subject: "Deck & envelope specialists nearby",
    },
  ],
  commercial: [
    {
      name: "Harbor City Retail Group",
      email: "facilities@harborcityretail.com",
      phone: "(555) 660-1100",
      subject: "Storefront envelope maintenance",
    },
    {
      name: "Bay Area Property Mgmt",
      email: "ops@bayareapm.com",
      phone: "(555) 660-4400",
      subject: "Phased commercial envelope work",
    },
  ],
};

export function scoreLead(lead: Lead): number {
  let score = 40;
  if (lead.email) score += 10;
  if (lead.phone) score += 10;
  if (lead.jobType === "commercial") score += 15;
  if (lead.source === "Referral") score += 20;
  if (lead.source === "Door-to-door") score += 12;
  if (lead.status === "qualified" || lead.status === "estimate") score += 10;
  return Math.min(100, score);
}

export function findProspectsForLead(
  data: AppData,
  lead: Lead,
  limit = 3,
): Omit<OutreachQueueItem, "id" | "status" | "workflowRunId" | "sentAt" | "createdAt">[] {
  const pool =
    lead.jobType === "commercial"
      ? PROSPECT_TEMPLATES.commercial
      : PROSPECT_TEMPLATES.residential;

  const existing = new Set(
    data.outreachQueue.map((o) => o.prospectEmail.toLowerCase()),
  );

  const cityHint = lead.city ? ` in ${lead.city}` : "";
  const messageBase = `Hi — BH Contracting Co. helps properties${cityHint} with ${lead.jobType} exterior work. Based on similar projects, we'd love to connect.`;

  return pool
    .filter((p) => !existing.has(p.email.toLowerCase()))
    .slice(0, limit)
    .map((p) => ({
      leadId: lead.id,
      prospectName: p.name,
      prospectEmail: p.email,
      prospectPhone: p.phone,
      channel: "email" as const,
      subject: p.subject,
      message: messageBase,
      scheduledAt: new Date().toISOString(),
    }));
}
