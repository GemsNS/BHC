import { findProspectsForLead, scoreLead } from "./lead-automation";
import type {
  AppData,
  AssistantCriteriaProfile,
  JobType,
  Lead,
  OutreachQueueItem,
} from "./types";

const REGION_PROSPECTS: Record<
  string,
  Array<{ name: string; email: string; phone: string; subject: string }>
> = {
  Denver: [
    {
      name: "Mile High Property Alliance",
      email: "ops@milehighproperty.org",
      phone: "(303) 555-4100",
      subject: "Roof & envelope partners — Denver metro",
    },
    {
      name: "Capitol Hill HOA Board",
      email: "maintenance@caphillhoa.org",
      phone: "(303) 555-4200",
      subject: "Storm-season roof inspections",
    },
  ],
  Aurora: [
    {
      name: "Aurora Commercial Parks",
      email: "facilities@auroracommercial.com",
      phone: "(303) 555-4300",
      subject: "Multi-tenant envelope maintenance",
    },
  ],
  Seaside: [
    {
      name: "Coastal Homeowners Assoc.",
      email: "board@coastalhoa.org",
      phone: "(555) 770-2200",
      subject: "Exterior upgrades for coastal homes",
    },
  ],
  "Harbor City": [
    {
      name: "Harbor City Retail Group",
      email: "facilities@harborcityretail.com",
      phone: "(555) 660-1100",
      subject: "Storefront envelope maintenance",
    },
  ],
};

function defaultProfile(data: AppData): AssistantCriteriaProfile {
  return (
    data.assistantProfiles.find((p) => p.enabled) ??
    data.assistantProfiles[0] ?? {
      id: "default",
      name: "Default",
      jobTypes: ["residential", "commercial"],
      regions: [],
      keywords: ["roof"],
      minLeadScore: 50,
      outreachTone: "Professional and local.",
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
      if (lead.status !== "qualified" && lead.status !== "estimate") return false;
    }
  }
  return !["won", "lost"].includes(lead.status);
}

function draftMessage(
  profile: AssistantCriteriaProfile,
  lead: Lead,
  prospectName: string,
): string {
  const region = lead.city ? ` in ${lead.city}` : "";
  return `Hi ${prospectName.split(" ")[0]} — BH Contracting Co. handles ${lead.jobType} exterior work${region}. ${profile.outreachTone} Reply if you'd like a scope call this week.`;
}

/** Score in-CRM leads + queue synthetic prospects from criteria regions */
export function huntLeadsFromCriteria(
  data: AppData,
  profileId?: string,
  limit = 5,
): { matchedLeads: Lead[]; queued: number; notes: string[] } {
  const profile = profileId
    ? data.assistantProfiles.find((p) => p.id === profileId) ?? defaultProfile(data)
    : defaultProfile(data);

  const notes: string[] = [];
  const matchedLeads = data.leads.filter((l) => {
    l.leadScore = scoreLead(l);
    return leadMatchesProfile(l, profile);
  });

  notes.push(
    `Profile "${profile.name}": ${matchedLeads.length} in-CRM lead(s) match criteria.`,
  );

  let queued = 0;
  const existing = new Set(
    data.outreachQueue.map((o) => o.prospectEmail.toLowerCase()),
  );
  const stamp = new Date().toISOString();

  for (const lead of matchedLeads.slice(0, 3)) {
    const prospects = findProspectsForLead(data, lead, 2);
    for (const p of prospects) {
      if (existing.has(p.prospectEmail.toLowerCase())) continue;
      data.outreachQueue.unshift({
        ...p,
        message: draftMessage(profile, lead, p.prospectName),
        id: `out-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        status: "pending_approval",
        workflowRunId: null,
        sentAt: null,
        createdAt: stamp,
      });
      existing.add(p.prospectEmail.toLowerCase());
      queued += 1;
    }
  }

  for (const region of profile.regions) {
    const pool = REGION_PROSPECTS[region] ?? [];
    for (const p of pool) {
      if (queued >= limit) break;
      if (existing.has(p.email.toLowerCase())) continue;
      const anchor =
        matchedLeads[0] ??
        data.leads.find((l) => l.city.toLowerCase().includes(region.toLowerCase()));
      const jobType: JobType = profile.jobTypes[0] ?? "residential";
      const syntheticLead: Lead = anchor ?? {
        id: "synthetic",
        name: "Criteria hunt",
        phone: "",
        email: "",
        address: region,
        city: region,
        source: "Mainframe AI",
        status: "qualified",
        jobType,
        notes: profile.keywords.join(", "),
        assignedToId: null,
        companyId: null,
        leadScore: profile.minLeadScore,
        createdAt: stamp,
        updatedAt: stamp,
      };

      const item: OutreachQueueItem = {
        id: `out-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        leadId: anchor?.id ?? null,
        prospectName: p.name,
        prospectEmail: p.email,
        prospectPhone: p.phone,
        channel: "email",
        subject: p.subject,
        message: draftMessage(profile, syntheticLead, p.name),
        status: "pending_approval",
        workflowRunId: null,
        scheduledAt: stamp,
        sentAt: null,
        createdAt: stamp,
      };
      data.outreachQueue.unshift(item);
      existing.add(p.email.toLowerCase());
      queued += 1;
      notes.push(`Queued regional prospect ${p.name} (${region}).`);
    }
  }

  return { matchedLeads, queued, notes };
}
