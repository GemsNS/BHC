/**
 * Guards against fabricated outreach / junk alert titles.
 * Synthetic prospects (hardcoded pools, 555 phones, invent-domains) must never send.
 */

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

const JUNK_AD_TITLE_RE =
  /today[\u2019']?s search results for|search results for|google alert|new results for your|saved search|kijiji alerts?:?\s*$/i;

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

export type PurgeSyntheticResult = {
  cancelledOutreach: number;
  removedAds: number;
  notes: string[];
};

/**
 * Cancel synthetic outreach drafts and drop junk alert listings (no real URL /
 * "Today's search results for …" titles). Safe to run repeatedly.
 */
export function purgeSyntheticOutreachAndAds(
  data: {
    outreachQueue: Array<{
      id: string;
      prospectName: string;
      prospectEmail: string;
      prospectPhone?: string;
      status: string;
      message?: string;
      leadId?: string | null;
    }>;
    adListings: Array<{
      id: string;
      title: string;
      url: string;
      contactEmail?: string;
      contactPhone?: string;
      status: string;
      notes?: string;
    }>;
  },
): PurgeSyntheticResult {
  const notes: string[] = [];
  let cancelledOutreach = 0;
  for (const o of data.outreachQueue) {
    if (o.status === "sent" || o.status === "cancelled") continue;
    const synthetic =
      o.id.startsWith("out-region-") ||
      looksFabricatedProspect({
        name: o.prospectName,
        email: o.prospectEmail,
        phone: o.prospectPhone,
      }) ||
      /reaching out regarding .* in .*, ns/i.test(o.message ?? "");
    if (!synthetic) continue;
    o.status = "cancelled";
    cancelledOutreach += 1;
  }
  if (cancelledOutreach) {
    notes.push(`Cancelled ${cancelledOutreach} synthetic outreach draft(s).`);
  }

  const before = data.adListings.length;
  data.adListings = data.adListings.filter((ad) => {
    if (isJunkAdTitle(ad.title) && !isRealHttpUrl(ad.url)) return false;
    if (
      !isRealHttpUrl(ad.url) &&
      looksFabricatedProspect({
        email: ad.contactEmail,
        phone: ad.contactPhone,
      })
    ) {
      return false;
    }
    return true;
  }) as typeof data.adListings;
  const removedAds = before - data.adListings.length;
  if (removedAds) notes.push(`Removed ${removedAds} junk ad listing(s).`);

  return { cancelledOutreach, removedAds, notes };
}
