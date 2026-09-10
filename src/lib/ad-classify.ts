import { completeChat } from "./ai-provider";
import { looksLikeRealEstateNoise } from "./lead-search-recipes";
import type { AdCategory, AdListing, JobType } from "./types";

/**
 * Decide whether an ad is a real "I need exterior work done" request and
 * draft the reply. AI (Claude) when a key is configured, keyword heuristics
 * otherwise — both produce the same shape so the pipeline never blocks.
 */

export type Classification = {
  isJobRequest: boolean;
  score: number;
  category: AdCategory;
  jobType: JobType | null;
  summary: string;
  reasons: string[];
  contactName: string;
  location: string;
  by: "ai" | "local";
};

export type ReplyDraft = {
  emailSubject: string;
  emailBody: string;
  smsBody: string;
  by: "ai" | "local";
};

export type CompanyProfile = {
  name: string;
  shortName: string;
  signer: string;
  phone: string;
  email: string;
  website: string;
  area: string;
  services: string;
};

function env(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const v = process.env?.[name]?.trim();
  return v || undefined;
}

export function companyProfile(): CompanyProfile {
  return {
    name: env("OUTREACH_COMPANY_NAME") ?? "BH Contracting LTD.",
    shortName: env("OUTREACH_COMPANY_SHORT") ?? "BH Contracting",
    signer: env("OUTREACH_SIGNER") ?? "Cameron",
    phone: env("OUTREACH_REPLY_PHONE") ?? "",
    email: env("OUTREACH_REPLY_EMAIL") ?? env("CONTACT_TO_EMAIL") ?? "info@bhcontracting.ca",
    website: env("OUTREACH_WEBSITE") ?? "https://bhcontracting.ca",
    area: env("OUTREACH_SERVICE_AREA") ?? "Halifax Regional Municipality and surrounding Nova Scotia",
    services:
      env("OUTREACH_SERVICES") ??
      "siding, soffit & fascia, decks, windows & doors, exterior trim and full building-envelope work for homes and commercial buildings",
  };
}

/* ------------------------------ heuristics ------------------------------ */

const CATEGORY_KEYWORDS: Array<{ cat: AdCategory; words: RegExp; label: string }> = [
  { cat: "siding", words: /\b(siding|vinyl siding|hardie|cladding|clapboard|board and batten|cedar shakes?)\b/i, label: "siding" },
  { cat: "roofing", words: /\b(roof(ing|er)?|shingles?|metal roof|flat roof|leak(ing)? roof)\b/i, label: "roofing" },
  { cat: "decks", words: /\b(deck(s|ing)?|patio|porch|railing|stairs|pergola)\b/i, label: "decks" },
  { cat: "windows_doors", words: /\b(windows?|doors?|patio door|entry door|window (install|replacement))\b/i, label: "windows & doors" },
  { cat: "soffit_fascia_gutters", words: /\b(soffit|fascia|eaves ?trough|gutters?|downspouts?)\b/i, label: "soffit, fascia & gutters" },
  { cat: "fencing", words: /\b(fenc(e|ing)|gate)\b/i, label: "fencing" },
  { cat: "exterior_painting", words: /\b(exterior paint(ing)?|stain(ing)? (deck|fence|siding)|repaint)\b/i, label: "exterior painting" },
  { cat: "commercial_envelope", words: /\b(warehouse|commercial|storefront|building envelope|multi[- ]unit|apartment building|strip mall)\b/i, label: "commercial exterior work" },
  { cat: "general_exterior", words: /\b(exterior|renovation|reno|contractor|handyman|repair|framing|sheathing|insulation|house wrap)\b/i, label: "exterior renovation" },
];

const DEMAND_RE =
  /\b(looking for|need(ed|ing)?( a| an| some)?|want(ed|ing)?( to hire)?|hire|hiring|quote|quotes|estimate|contractor wanted|someone to|who (can|does)|recommend(ation)?s?|seeking|asap|how much (to|would)|price to)\b/i;
const SUPPLY_RE =
  /\b(for sale|we (offer|install|specialize|provide|do)|our (team|company|services|crew)|call us|free estimates?|years? (of )?experience|licensed (and|&) insured|fully insured|book (now|today)|serving (hrm|halifax)|now booking|accepting new (clients|customers)|hire us|we come to you)\b/i;
const COMMERCIAL_RE = /\b(commercial|warehouse|business|storefront|units?|building|industrial|office|tenant|landlord|property manag)/i;
const HRM_RE =
  /\b(halifax|dartmouth|bedford|sackville|cole harbour|timberlea|hammonds plains|fall river|spryfield|clayton park|eastern passage|tantallon|hubbards|mount uniacke|windsor junction|waverley|porters lake|lawrencetown|beaver bank|enfield|elmsdale|hrm|nova scotia|\bns\b)\b/i;

export function classifyAdLocal(ad: Pick<AdListing, "title" | "body" | "location" | "contactEmail" | "contactPhone" | "contactName">): Classification {
  const text = `${ad.title}\n${ad.body}`;
  const reasons: string[] = [];
  let score = 35;

  let category: AdCategory = "other";
  let catLabel = "";
  for (const c of CATEGORY_KEYWORDS) {
    if (c.words.test(text)) {
      category = c.cat;
      catLabel = c.label;
      break;
    }
  }
  if (category !== "other") {
    score += 20;
    reasons.push(`mentions ${catLabel}`);
  } else {
    score -= 15;
    reasons.push("no exterior trade keywords");
  }

  if (DEMAND_RE.test(text)) {
    score += 25;
    reasons.push("poster is asking for help / a quote");
  }
  if (SUPPLY_RE.test(text)) {
    score -= 45;
    reasons.push("reads like a contractor advertising services");
  }
  if (looksLikeRealEstateNoise(text)) {
    score -= 50;
    reasons.push("looks like a real-estate / for-sale listing");
  } else if (/\bfor sale\b|\$\s?\d+\s*(obo|firm)\b/i.test(text) && !DEMAND_RE.test(text)) {
    score -= 20;
    reasons.push("looks like an item for sale");
  }

  const locMatch = text.match(HRM_RE) ?? ad.location.match(HRM_RE);
  if (locMatch) {
    score += 10;
    reasons.push(`in service area (${locMatch[0]})`);
  }
  if (ad.contactEmail || ad.contactPhone) {
    score += 10;
    reasons.push("direct contact available");
  }

  const jobType: JobType | null =
    category === "other" ? null : COMMERCIAL_RE.test(text) || category === "commercial_envelope" ? "commercial" : "residential";

  score = Math.max(0, Math.min(100, Math.round(score)));
  const isJobRequest = score >= 55;
  const summary = isJobRequest
    ? `${jobType === "commercial" ? "Commercial" : "Homeowner"} ${catLabel || "exterior"} request: ${ad.title.slice(0, 90)}`
    : `Probably not a job request: ${ad.title.slice(0, 90)}`;

  return {
    isJobRequest,
    score,
    category,
    jobType,
    summary,
    reasons,
    contactName: ad.contactName,
    location: ad.location || locMatch?.[0] || "",
    by: "local",
  };
}

/* ---------------------------------- AI ---------------------------------- */

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const CLASSIFY_SYSTEM = `You triage classified ads for a Nova Scotia exterior contractor (siding, soffit/fascia, decks, windows & doors, exterior trim, building envelope; residential and commercial). Decide if the ad is a genuine request for that kind of work that the contractor could quote. Ads where someone is SELLING services or items are NOT job requests. Respond with strict JSON only:
{"isJobRequest": boolean, "score": 0-100, "category": one of ${JSON.stringify([
  "siding",
  "roofing",
  "decks",
  "windows_doors",
  "soffit_fascia_gutters",
  "fencing",
  "exterior_painting",
  "general_exterior",
  "commercial_envelope",
  "other",
])}, "jobType": "residential"|"commercial"|null, "summary": "one sentence, what the poster wants", "reasons": ["short signal", ...], "contactName": "first name if stated else empty", "location": "town/area if stated else empty"}`;

export async function classifyAd(
  ad: AdListing,
  opts: { ai?: boolean } = {},
): Promise<Classification> {
  const local = classifyAdLocal(ad);
  if (opts.ai === false) return local;
  try {
    const res = await completeChat({
      system: CLASSIFY_SYSTEM,
      user: `Source: ${ad.sourceName}\nTitle: ${ad.title}\nLocation: ${ad.location || "unknown"}\nPosted: ${ad.postedAt ?? "unknown"}\n\n${ad.body.slice(0, 3000)}`,
      temperature: 0,
      tier: "fast",
      maxTokens: 400,
    });
    if (!res) return local;
    const json = extractJson(res.text);
    if (!json) return local;
    const score = Math.max(0, Math.min(100, Number(json.score ?? local.score)));
    const category = (typeof json.category === "string" && (CATEGORY_KEYWORDS.some((c) => c.cat === json.category) || json.category === "other")
      ? json.category
      : local.category) as AdCategory;
    const jobType = json.jobType === "commercial" || json.jobType === "residential" ? json.jobType : local.jobType;
    return {
      isJobRequest: Boolean(json.isJobRequest ?? score >= 55),
      score,
      category,
      jobType,
      summary: String(json.summary ?? local.summary).slice(0, 300),
      reasons: Array.isArray(json.reasons) ? (json.reasons as unknown[]).map(String).slice(0, 6) : local.reasons,
      contactName: String(json.contactName ?? ad.contactName ?? "").slice(0, 60),
      location: String(json.location ?? local.location ?? "").slice(0, 80),
      by: "ai",
    };
  } catch {
    return local;
  }
}

/* -------------------------------- drafting ------------------------------- */

function categoryLine(category: AdCategory): string {
  return CATEGORY_KEYWORDS.find((c) => c.cat === category)?.label ?? "exterior work";
}

export function draftReplyLocal(ad: AdListing, profile = companyProfile()): ReplyDraft {
  const first = (ad.contactName || "").split(/\s+/)[0];
  const hi = first ? `Hi ${first},` : "Hi there,";
  const where = ad.location ? ` in ${ad.location}` : "";
  const cat = categoryLine(ad.category);
  const contact = [profile.phone && `call/text ${profile.phone}`, `email ${profile.email}`].filter(Boolean).join(" or ");

  const emailSubject = `Re: ${ad.title.slice(0, 70)} — free written quote`;
  const emailBody = [
    hi,
    "",
    `I saw your post "${ad.title.slice(0, 90)}"${where}. ${profile.name} is a local exterior contractor serving ${profile.area} — we do ${profile.services}.`,
    "",
    `We'd be glad to come out, take measurements, and give you a written quote for the ${cat} at no charge. Most quotes go out within 48 hours of the site visit.`,
    "",
    `If that works, reply with a good day/time, or ${contact}. Recent projects: ${profile.website}`,
    "",
    "Thanks,",
    profile.signer,
    `${profile.name} · ${[profile.phone, profile.email].filter(Boolean).join(" · ")}`,
    "",
    "If you've already found someone, just reply \"no thanks\" and we won't follow up again.",
  ].join("\n");

  const shortTitle = ad.title.replace(/\s+/g, " ").slice(0, 60);
  let smsBody = `${first ? `Hi ${first}` : "Hi"}, this is ${profile.signer} with ${profile.shortName} (${profile.area.split(" and")[0]}). Saw your post about "${shortTitle}" — we do ${cat} and can give a free written quote. Good time for a quick look? Reply STOP to opt out.`;
  if (smsBody.length > 320) smsBody = `${smsBody.slice(0, 300).replace(/\s+\S*$/, "")}… Reply STOP to opt out.`;

  return { emailSubject, emailBody, smsBody, by: "local" };
}

const DRAFT_SYSTEM = `You write short, warm, professional first-contact replies for a Nova Scotia exterior contractor answering a classified ad where someone asked for work to be done. Rules: reference the ad naturally in one sentence; say what the company does in one sentence; offer a free written quote after a site visit; give ONE clear next step; no pressure, no discounts, no exclamation marks, no emojis. Email under 140 words, plain text, ends with the signature block provided verbatim and the opt-out line provided verbatim. SMS under 300 characters, ends with "Reply STOP to opt out." Respond with strict JSON only: {"emailSubject": "...", "emailBody": "...", "smsBody": "..."}`;

export async function draftReply(
  ad: AdListing,
  opts: { ai?: boolean; profile?: CompanyProfile } = {},
): Promise<ReplyDraft> {
  const profile = opts.profile ?? companyProfile();
  const local = draftReplyLocal(ad, profile);
  if (opts.ai === false) return local;
  try {
    const signature = `${profile.signer}\n${profile.name} · ${[profile.phone, profile.email].filter(Boolean).join(" · ")}\n${profile.website}`;
    const optOut = 'If you\'ve already found someone, just reply "no thanks" and we won\'t follow up again.';
    const res = await completeChat({
      system: DRAFT_SYSTEM,
      user: [
        `Company: ${profile.name} — ${profile.services}. Service area: ${profile.area}.`,
        `Signature block (verbatim):\n${signature}`,
        `Opt-out line (verbatim): ${optOut}`,
        `Poster first name: ${ad.contactName || "unknown"}`,
        `Ad title: ${ad.title}`,
        `Ad location: ${ad.location || "unknown"}`,
        `Ad text:\n${ad.body.slice(0, 2500)}`,
        `What we think they want: ${ad.summary || "(unclear)"} (category ${ad.category})`,
      ].join("\n\n"),
      temperature: 0.5,
      tier: "main",
      maxTokens: 900,
    });
    if (!res) return local;
    const json = extractJson(res.text);
    if (!json || typeof json.emailBody !== "string" || typeof json.smsBody !== "string") return local;
    let smsBody = String(json.smsBody).trim();
    if (!/stop to opt out/i.test(smsBody)) smsBody = `${smsBody} Reply STOP to opt out.`;
    if (smsBody.length > 320) smsBody = local.smsBody;
    let emailBody = String(json.emailBody).trim();
    if (!/no thanks/i.test(emailBody)) emailBody = `${emailBody}\n\n${optOut}`;
    return {
      emailSubject: String(json.emailSubject ?? local.emailSubject).slice(0, 120),
      emailBody,
      smsBody,
      by: "ai",
    };
  } catch {
    return local;
  }
}

/** Follow-up text when the first message got no reply. */
export function draftFollowUpLocal(ad: AdListing, channel: "email" | "sms", profile = companyProfile()): { subject: string; body: string } {
  const first = (ad.contactName || "").split(/\s+/)[0];
  if (channel === "sms") {
    return {
      subject: "",
      body: `${first ? `Hi ${first}` : "Hi"}, ${profile.signer} from ${profile.shortName} again — still happy to quote the ${categoryLine(ad.category)} if you haven't sorted it. Just reply with a good time. Reply STOP to opt out.`,
    };
  }
  return {
    subject: `Re: ${ad.title.slice(0, 70)} — still available to quote`,
    body: [
      first ? `Hi ${first},` : "Hi there,",
      "",
      `Quick follow-up on your post "${ad.title.slice(0, 90)}". If you're still looking, we can come by this week for a free written quote on the ${categoryLine(ad.category)}.`,
      "",
      `Reply with a good time${profile.phone ? ` or text ${profile.phone}` : ""}.`,
      "",
      profile.signer,
      `${profile.name} · ${[profile.phone, profile.email].filter(Boolean).join(" · ")}`,
      "",
      "If you've already found someone, reply \"no thanks\" and this will be the last note.",
    ].join("\n"),
  };
}
