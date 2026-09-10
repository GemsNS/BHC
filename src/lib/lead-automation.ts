import type { AppData, Lead, OutreachQueueItem } from "./types";
import { isPlaceholderPhone, isRealContactEmail } from "./outreach-guard";

/**
 * Find similar *real* CRM leads to use as outreach targets.
 * Never invents contacts — previous demo templates (coastalhoa.org, etc.) are gone.
 */
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
  const existing = new Set(
    data.outreachQueue.map((o) => o.prospectEmail.toLowerCase()).filter(Boolean),
  );
  const city = lead.city.trim().toLowerCase();

  const similar = data.leads
    .filter((l) => {
      if (l.id === lead.id) return false;
      if (!isRealContactEmail(l.email)) return false;
      if (existing.has(l.email.toLowerCase())) return false;
      if (isPlaceholderPhone(l.phone)) return false;
      if (l.jobType !== lead.jobType) return false;
      if (city && !l.city.toLowerCase().includes(city) && !city.includes(l.city.toLowerCase())) {
        // allow same HRM cluster if job type matches and score is decent
        if (l.leadScore < 55) return false;
      }
      return true;
    })
    .sort((a, b) => b.leadScore - a.leadScore)
    .slice(0, limit);

  const cityHint = lead.city ? ` in ${lead.city}` : "";
  const messageBase = `Hi — BH Contracting LTD. helps properties${cityHint} with ${lead.jobType} exterior work. Based on similar projects, we'd love to connect.`;

  return similar.map((p) => ({
    leadId: lead.id,
    prospectName: p.name,
    prospectEmail: p.email.trim(),
    prospectPhone: p.phone?.trim() || "",
    channel: "email" as const,
    subject: `${p.jobType === "commercial" ? "Commercial" : "Residential"} exterior work — ${p.city}`,
    message: messageBase,
    scheduledAt: new Date().toISOString(),
  }));
}
