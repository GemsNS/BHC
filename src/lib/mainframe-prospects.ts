/**
 * Lead hunting against the real CRM only — no invented contacts.
 *
 * Previous builds queued hardcoded regional "prospects" (coleharbour.ca,
 * sackvillebp.ca, …). Those never existed. Hunt now only drafts outreach to
 * leads already in the store that match the criteria profile and have a real
 * email or phone.
 */
import { isRealContactEmail, isPlaceholderPhone } from "./outreach-guard";
import { scoreLead } from "./lead-automation";
import type {
  AppData,
  AssistantCriteriaProfile,
  Lead,
  OutreachQueueItem,
} from "./types";

function defaultProfile(data: AppData): AssistantCriteriaProfile {
  return (
    data.assistantProfiles.find((p) => p.enabled) ??
    data.assistantProfiles[0] ?? {
      id: "default",
      name: "HRM default",
      jobTypes: ["residential", "commercial"],
      regions: ["Halifax", "Dartmouth"],
      keywords: ["roof"],
      minLeadScore: 50,
      outreachTone: "Professional Nova Scotia contractor.",
      enabled: true,
      updatedAt: new Date().toISOString(),
    }
  );
}

function leadMatchesProfile(lead: Lead, profile: AssistantCriteriaProfile): boolean {
  if (!profile.jobTypes.includes(lead.jobType)) return false;
  if (lead.leadScore < profile.minLeadScore) return false;
  if (profile.regions.length) {
    const city = lead.city.toLowerCase();
    if (!profile.regions.some((r) => city.includes(r.toLowerCase()))) return false;
  }
  if (profile.keywords.length) {
    const blob = `${lead.notes} ${lead.source} ${lead.address}`.toLowerCase();
    if (!profile.keywords.some((k) => blob.includes(k.toLowerCase()))) {
      return false;
    }
  }
  return true;
}

function leadHasReachableContact(lead: Lead): boolean {
  if (isRealContactEmail(lead.email)) return true;
  if (lead.phone?.trim() && !isPlaceholderPhone(lead.phone)) return true;
  return false;
}

function alreadyQueuedForLead(data: AppData, leadId: string): boolean {
  return data.outreachQueue.some(
    (o) =>
      o.leadId === leadId &&
      (o.status === "pending_approval" || o.status === "approved" || o.status === "sent"),
  );
}

export function huntLeadsFromCriteria(
  data: AppData,
  profileId?: string,
  limit = 5,
): { matchedLeads: Lead[]; queued: number; notes: string[] } {
  const profile = profileId
    ? (data.assistantProfiles.find((p) => p.id === profileId) ?? defaultProfile(data))
    : defaultProfile(data);

  const matchedLeads = data.leads
    .filter((l) => leadMatchesProfile(l, profile) && leadHasReachableContact(l))
    .sort((a, b) => b.leadScore - a.leadScore)
    .slice(0, limit);

  const notes: string[] = [];
  let queued = 0;
  const stamp = new Date().toISOString();

  for (const lead of matchedLeads) {
    if (alreadyQueuedForLead(data, lead.id)) {
      notes.push(`${lead.name} (${lead.city}) — already has outreach queued`);
      continue;
    }
    const channel = isRealContactEmail(lead.email) ? "email" : "sms";
    const subject = `${lead.jobType === "commercial" ? "Commercial" : "Residential"} exterior work — ${lead.city}`;
    const item: OutreachQueueItem = {
      id: `out-lead-${lead.id}-${Date.now()}`,
      leadId: lead.id,
      prospectName: lead.name,
      prospectEmail: isRealContactEmail(lead.email) ? lead.email.trim() : "",
      prospectPhone: lead.phone?.trim() || "",
      channel,
      subject,
      message: `${profile.outreachTone}\n\nHi ${lead.name.split(" ")[0] || "there"} — following up on your ${lead.jobType} inquiry in ${lead.city}. BH Contracting LTD. can schedule a free site visit and written quote. Reply to this message or email info@bhcontracting.ca.`,
      status: "pending_approval",
      workflowRunId: null,
      scheduledAt: stamp,
      sentAt: null,
      createdAt: stamp,
    };
    data.outreachQueue.unshift(item);
    queued += 1;
    notes.push(`${lead.name} (${lead.city}) score ${lead.leadScore} → ${channel} draft`);
  }

  if (!matchedLeads.length) {
    notes.push(
      "No matching CRM leads with a real email/phone. Import real ads (Kijiji alerts / web discovery with listing URLs) or create leads manually — hunting no longer invents contacts.",
    );
  }

  return { matchedLeads, queued, notes };
}

export { scoreLead };
