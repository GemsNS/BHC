/**
 * Guards against fabricated outreach / junk alert titles.
 * Synthetic prospects (hardcoded pools, 555 phones, invent-domains) must never send.
 */

import type { AdListing, AppData, Lead, OutreachQueueItem } from "./types";

const FABRICATED_EMAIL_DOMAINS = new Set([
  "peninsulapm.ca",
  "hydrostonehoa.ca",
  "dartmouthparks.ca",
  "bedfordres.ca",
  "sackvillebp.ca",
  "coleharbour.ca",
  "coastalhoa.org",
  "driftwoodgroup.org",
  "harborcityretail.com",
  "bayareapm.com",
  "mailinator.com",
]);

const FABRICATED_NAME_RE =
  /community board|business park|residential assoc|commercial parks|property managers|homeowners assoc|neighborhood group|retail group|property mgmt|heritage hoa/i;

/** Shared junk digest / alert-email subject patterns (ingest + purge + health). */
export const JUNK_AD_TITLE_RE =
  /today[\u2019']?s search results for|search results for|google alert|new results for your|saved search|kijiji alerts?:?\s*$|new matches for|your kijiji alert|craigslist alert|facebook marketplace alert/i;

export function emailDomain(email: string): string {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return "";
  return email.trim().toLowerCase().slice(at + 1);
}

export function isPlaceholderPhone(phone: string | null | undefined): boolean {
  if (!phone?.trim()) return false;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return false;
  // North-American fictional 555 exchange, or all zeros
  if (/^\d{0,3}555\d{4}$/.test(digits)) return true;
  if (/^1?555\d{7}$/.test(digits)) return true;
  if (/^0+$/.test(digits)) return true;
  return false;
}

export function isRealContactEmail(email: string | null | undefined): boolean {
  const v = (email ?? "").trim().toLowerCase();
  if (!v || !v.includes("@") || v.length < 6) return false;
  if (v.endsWith("@bhcontracting.ca")) return false; // never outreach ourselves
  const domain = emailDomain(v);
  if (!domain || !domain.includes(".")) return false;
  if (FABRICATED_EMAIL_DOMAINS.has(domain)) return false;
  if (/^(noreply|no-reply|donotreply|mailer-daemon|postmaster)@/i.test(v)) return false;
  return true;
}

export function isRealHttpUrl(url: string | null | undefined): boolean {
  const v = (url ?? "").trim();
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function isJunkAdTitle(title: string | null | undefined): boolean {
  return JUNK_AD_TITLE_RE.test(title ?? "");
}

export function looksFabricatedProspect(input: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): boolean {
  if (input.email && !isRealContactEmail(input.email) && (input.email ?? "").includes("@")) {
    return true;
  }
  if (isPlaceholderPhone(input.phone)) return true;
  if (FABRICATED_NAME_RE.test(input.name ?? "")) return true;
  return false;
}

export function hasReachableAdContact(input: {
  contactEmail?: string | null;
  contactPhone?: string | null;
  email?: string | null;
  phone?: string | null;
}): boolean {
  if (isRealContactEmail(input.contactEmail ?? input.email)) return true;
  const phone = (input.contactPhone ?? input.phone ?? "").trim();
  if (!phone || isPlaceholderPhone(phone)) return false;
  return phone.replace(/\D/g, "").length >= 10;
}

/** Alert digests that must never become CRM leads (search-result subjects / fabricated contacts). */
export function isJunkDigestAd(ad: {
  title?: string | null;
  url?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
} | null | undefined): boolean {
  if (!ad) return true;
  const urlOk = isRealHttpUrl(ad.url);
  if (isJunkAdTitle(ad.title) && !urlOk) return true;
  // Fabricated demo contacts with no listing URL (keep real emails even if phone is 555 in fixtures)
  if (!urlOk && !isRealContactEmail(ad.contactEmail)) {
    if (
      looksFabricatedProspect({
        email: ad.contactEmail,
        phone: ad.contactPhone,
      })
    ) {
      return true;
    }
  }
  return false;
}

export function isSyntheticLead(lead: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  source?: string | null;
}): boolean {
  if (
    looksFabricatedProspect({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
    })
  ) {
    return true;
  }
  const name = lead.name ?? "";
  const notes = lead.notes ?? "";
  if (/^Ad poster\s*[—–-]/i.test(name) && isJunkAdTitle(name.replace(/^Ad poster\s*[—–-]\s*/i, ""))) {
    return true;
  }
  if (/^Ad poster\s*[—–-]/i.test(name) && isJunkAdTitle(notes)) {
    return true;
  }
  if (
    /^Ad poster\s*[—–-]/i.test(name) &&
    (!lead.address || /^see ad$/i.test(lead.address.trim())) &&
    !isRealContactEmail(lead.email) &&
    !isRealHttpUrl(lead.address)
  ) {
    return true;
  }
  return false;
}

export type PurgeSyntheticResult = {
  cancelledOutreach: number;
  removedAds: number;
  removedLeads: number;
  notes: string[];
};

/**
 * Cancel synthetic outreach drafts, drop junk alert listings, and remove CRM
 * leads created from those digests / fabricated contacts. Safe to run repeatedly.
 */
export function purgeSyntheticOutreachAndAds(
  data: Pick<AppData, "outreachQueue" | "adListings" | "leads"> & {
    outreachQueue: OutreachQueueItem[];
    adListings: AdListing[];
    leads: Lead[];
  },
): PurgeSyntheticResult {
  const notes: string[] = [];
  let cancelledOutreach = 0;

  const junkAdIds = new Set(
    data.adListings.filter((ad) => isJunkDigestAd(ad)).map((ad) => ad.id),
  );
  const junkLeadIds = new Set(
    data.adListings
      .filter((ad) => junkAdIds.has(ad.id) && ad.leadId)
      .map((ad) => ad.leadId as string),
  );

  for (const o of data.outreachQueue) {
    if (o.status === "sent" || o.status === "cancelled") continue;
    const synthetic =
      o.id.startsWith("out-region-") ||
      looksFabricatedProspect({
        name: o.prospectName,
        email: o.prospectEmail,
        phone: o.prospectPhone,
      }) ||
      /reaching out regarding .* in .*, ns/i.test(o.message ?? "") ||
      Boolean(o.adId && junkAdIds.has(o.adId)) ||
      Boolean(o.leadId && junkLeadIds.has(o.leadId));
    if (!synthetic) continue;
    o.status = "cancelled";
    cancelledOutreach += 1;
  }
  if (cancelledOutreach) {
    notes.push(`Cancelled ${cancelledOutreach} synthetic outreach draft(s).`);
  }

  const beforeAds = data.adListings.length;
  data.adListings = data.adListings.filter((ad) => !junkAdIds.has(ad.id)) as typeof data.adListings;
  const removedAds = beforeAds - data.adListings.length;
  if (removedAds) notes.push(`Removed ${removedAds} junk ad listing(s).`);

  const beforeLeads = data.leads.length;
  data.leads = data.leads.filter((lead) => {
    if (junkLeadIds.has(lead.id)) return false;
    if (isSyntheticLead(lead)) return false;
    return true;
  }) as typeof data.leads;
  const removedLeads = beforeLeads - data.leads.length;
  if (removedLeads) notes.push(`Removed ${removedLeads} synthetic CRM lead(s).`);

  return { cancelledOutreach, removedAds, removedLeads, notes };
}
