/**
 * HRM prospect pools for lead hunting — Nova Scotia local market.
 */
import { findProspectsForLead, scoreLead } from "./lead-automation";
import type {
  AppData,
  AssistantCriteriaProfile,
  Lead,
  OutreachQueueItem,
} from "./types";

const REGION_PROSPECTS: Record<
  string,
  Array<{ name: string; email: string; phone: string; subject: string }>
> = {
  Halifax: [
    {
      name: "Peninsula Property Managers",
      email: "ops@peninsulapm.ca",
      phone: "(902) 555-4100",
      subject: "Envelope maintenance — Halifax peninsula",
    },
    {
      name: "Hydrostone Heritage HOA",
      email: "board@hydrostonehoa.ca",
      phone: "(902) 555-4200",
      subject: "Heritage district exterior upgrades",
    },
  ],
  Dartmouth: [
    {
      name: "Dartmouth Commercial Parks",
      email: "facilities@dartmouthparks.ca",
      phone: "(902) 555-4300",
      subject: "Multi-tenant roof & siding programs",
    },
  ],
  Bedford: [
    {
      name: "Bedford Residential Assoc.",
      email: "maintenance@bedfordres.ca",
      phone: "(902) 555-4400",
      subject: "Storm-season roof inspections",
    },
  ],
  Sackville: [
    {
      name: "Sackville Business Park",
      email: "facilities@sackvillebp.ca",
      phone: "(902) 555-4500",
      subject: "Commercial envelope contractors",
    },
  ],
  "Cole Harbour": [
    {
      name: "Cole Harbour Community Board",
      email: "projects@coleharbour.ca",
      phone: "(902) 555-4600",
      subject: "Residential renovation partners",
    },
  ],
};

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

export function huntLeadsFromCriteria(
  data: AppData,
  profileId?: string,
  limit = 5,
): { matchedLeads: Lead[]; queued: number; notes: string[] } {
  const profile = profileId
    ? (data.assistantProfiles.find((p) => p.id === profileId) ?? defaultProfile(data))
    : defaultProfile(data);

  const matchedLeads = data.leads
    .filter((l) => leadMatchesProfile(l, profile))
    .sort((a, b) => b.leadScore - a.leadScore)
    .slice(0, limit);

  const notes: string[] = [];
  let queued = 0;
  const stamp = new Date().toISOString();

  for (const lead of matchedLeads) {
    const prospects = findProspectsForLead(data, lead, 2);
    for (const p of prospects) {
      const item: OutreachQueueItem = {
        ...p,
        id: `out-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        status: "pending_approval",
        workflowRunId: null,
        sentAt: null,
        createdAt: stamp,
        channel: p.channel ?? "email",
        scheduledAt: stamp,
      };
      data.outreachQueue.unshift(item);
      queued++;
    }
    notes.push(`${lead.name} (${lead.city}) score ${lead.leadScore}`);
  }

  for (const region of profile.regions) {
    const pool = REGION_PROSPECTS[region];
    if (!pool?.length) continue;
    const pick = pool[queued % pool.length];
    data.outreachQueue.unshift({
      id: `out-region-${Date.now()}-${region}`,
      leadId: null,
      prospectName: pick.name,
      prospectEmail: pick.email,
      prospectPhone: pick.phone,
      channel: "email",
      subject: pick.subject,
      message: `${profile.outreachTone}\n\nReaching out regarding ${pick.subject} in ${region}, NS.`,
      status: "pending_approval",
      workflowRunId: null,
      scheduledAt: stamp,
      sentAt: null,
      createdAt: stamp,
    });
    queued++;
    notes.push(`Regional prospect: ${pick.name} (${region})`);
  }

  if (!matchedLeads.length && !queued) {
    notes.push("No matching leads — import leads via Mainframe or create manually.");
  }

  return { matchedLeads, queued, notes };
}

export { scoreLead };
