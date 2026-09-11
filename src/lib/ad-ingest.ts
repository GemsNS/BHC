import { queueWebhook } from "./webhooks";
import {
  DEFAULT_AD_EXCLUDE_KEYWORDS,
  DEFAULT_AD_KEEP_KEYWORDS,
  DEFAULT_PUBLIC_AD_SOURCES,
  looksLikeRealEstateNoise,
} from "./lead-search-recipes";
import {
  isJunkAdTitle,
  isRealHttpUrl,
} from "./outreach-guard";
import type { AdListing, AdSource, AppData } from "./types";

/**
 * Pull "someone needs a contractor" ads into the CRM from:
 *   - RSS/Atom feeds (any site that still publishes one, or an RSS bridge)
 *   - alert emails (Kijiji / Craigslist / Marketplace "new listing" mails)
 *   - inbound webhooks (Zapier, Make, Cloudflare Email Worker, Mailgun routes)
 *   - manual paste
 *
 * Everything here is pure and testable; network + IMAP live in callers.
 */

export type RawAd = {
  externalId?: string;
  url?: string;
  title: string;
  body: string;
  postedAt?: string | null;
  location?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
};

/* ------------------------------ text utils ------------------------------ */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+|#\d+);/gi, (m, code: string) => {
    const lower = code.toLowerCase();
    if (ENTITIES[lower] != null) return ENTITIES[lower];
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return m;
  });
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Strip tracking params and fragments so the same listing dedupes across alerts. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    const keep = new URLSearchParams();
    for (const [k, v] of u.searchParams) {
      if (/^(utm_|fbclid|gclid|ref|source|siteLocale|_ga)/i.test(k)) continue;
      keep.set(k, v);
    }
    u.search = keep.toString() ? `?${keep.toString()}` : "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

export function extractContacts(text: string): { phone: string; email: string } {
  const email = text.match(EMAIL_RE)?.[0] ?? "";
  const p = text.match(PHONE_RE);
  const phone = p ? `${p[1]}-${p[2]}-${p[3]}` : "";
  return { phone, email };
}

/* ------------------------------ RSS / Atom ------------------------------ */

function tag(block: string, names: string[]): string {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i");
    const m = block.match(re);
    if (m) {
      const inner = m[1].trim();
      const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
      return (cdata ? cdata[1] : inner).trim();
    }
  }
  return "";
}

function atomLink(block: string): string {
  const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  if (alt) return alt[1];
  const any = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  return any ? any[1] : "";
}

export function parseFeed(xml: string): RawAd[] {
  const blocks = [
    ...(xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? []),
  ];
  const out: RawAd[] = [];
  for (const block of blocks) {
    const title = stripHtml(tag(block, ["title"]));
    const rssLink = tag(block, ["link"]);
    const link = (rssLink && !rssLink.startsWith("<") ? rssLink : "") || atomLink(block);
    const bodyRaw = tag(block, ["content:encoded", "description", "summary", "content"]);
    const body = stripHtml(bodyRaw).slice(0, 4000);
    const dateRaw = tag(block, ["pubDate", "published", "updated", "dc:date"]);
    const postedAt = dateRaw && !Number.isNaN(Date.parse(dateRaw)) ? new Date(dateRaw).toISOString() : null;
    const guid = stripHtml(tag(block, ["guid", "id"]));
    if (!title && !body) continue;
    const contacts = extractContacts(`${title}\n${body}`);
    out.push({
      externalId: guid || (link ? canonicalUrl(link) : hashText(title + body)),
      url: link ? canonicalUrl(link) : "",
      title: title || body.slice(0, 80),
      body,
      postedAt,
      contactEmail: contacts.email,
      contactPhone: contacts.phone,
    });
  }
  return out;
}

/* ----------------------------- alert emails ----------------------------- */

const LISTING_URL_RE =
  /https?:\/\/(?:www\.)?(?:kijiji\.ca\/v-[^\s"'<>)\]]+|[a-z0-9-]+\.craigslist\.org\/[a-z]{3}\/[^\s"'<>)\]]+|(?:www\.)?facebook\.com\/marketplace\/item\/\d+[^\s"'<>)\]]*|(?:www\.)?homestars\.com\/[^\s"'<>)\]]+|(?:www\.)?nextdoor\.com\/[^\s"'<>)\]]+|(?:www\.)?reddit\.com\/r\/[^\s"'<>)\]]+)/gi;

export function listingIdFromUrl(url: string): string {
  const kijiji = url.match(/kijiji\.ca\/v-[^/]+\/[^/]+\/[^/]+\/(\d+)/i);
  if (kijiji) return `kijiji:${kijiji[1]}`;
  const cl = url.match(/craigslist\.org\/.*\/(\d+)\.html/i);
  if (cl) return `craigslist:${cl[1]}`;
  const fb = url.match(/marketplace\/item\/(\d+)/i);
  if (fb) return `facebook:${fb[1]}`;
  const reddit = url.match(/reddit\.com\/r\/[^/]+\/comments\/([a-z0-9]+)/i);
  if (reddit) return `reddit:${reddit[1]}`;
  return canonicalUrl(url);
}

/* ---------------------- Kijiji / public HTML search --------------------- */

type KijijiListingLike = {
  __typename?: string;
  id?: string | number;
  title?: string;
  description?: string;
  url?: string;
  activationDate?: string;
  sortingDate?: string;
  location?: { name?: string; address?: string };
};

/**
 * Parse Kijiji search-result HTML (__NEXT_DATA__ Apollo StandardListing cards).
 * Falls back to scraping /v-… listing anchors when the JSON blob is missing.
 */
export function parseKijijiSearchHtml(html: string): RawAd[] {
  const out: RawAd[] = [];
  const seen = new Set<string>();

  const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (next?.[1]) {
    try {
      const data = JSON.parse(next[1]) as {
        props?: { pageProps?: { __APOLLO_STATE__?: Record<string, KijijiListingLike> } };
      };
      const state = data.props?.pageProps?.__APOLLO_STATE__ ?? {};
      for (const [key, node] of Object.entries(state)) {
        if (!node || typeof node !== "object") continue;
        if (node.__typename !== "StandardListing" && !key.startsWith("StandardListing:")) continue;
        const title = String(node.title ?? "").trim();
        const url = String(node.url ?? "").trim();
        if (!title || !url) continue;
        const id = listingIdFromUrl(url);
        if (seen.has(id)) continue;
        seen.add(id);
        const body = stripHtml(String(node.description ?? "")).slice(0, 4000);
        const contacts = extractContacts(`${title}\n${body}`);
        const posted =
          node.sortingDate || node.activationDate
            ? new Date(String(node.sortingDate || node.activationDate)).toISOString()
            : null;
        out.push({
          externalId: id,
          url: canonicalUrl(url),
          title: title.slice(0, 200),
          body,
          postedAt: posted && !Number.isNaN(Date.parse(posted)) ? posted : null,
          location: node.location?.name || node.location?.address || "",
          contactEmail: contacts.email,
          contactPhone: contacts.phone,
        });
      }
    } catch {
      /* fall through to anchor scrape */
    }
  }

  if (!out.length) {
    const anchorRe = /<a\b[^>]*href=["'](https?:\/\/(?:www\.)?kijiji\.ca\/v-[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = anchorRe.exec(html))) {
      const url = canonicalUrl(m[1]);
      const id = listingIdFromUrl(url);
      if (seen.has(id)) continue;
      const title = stripHtml(m[2]);
      if (title.length < 4 || /^(view|see|open|more|details|photo)/i.test(title)) continue;
      seen.add(id);
      out.push({
        externalId: id,
        url,
        title: title.slice(0, 200),
        body: "",
        postedAt: null,
      });
    }
  }
  return out;
}

/** Detect HTML vs feed XML and parse accordingly (Kijiji search pages, etc.). */
export function parseFetchedAdDocument(body: string, sourceUrl = ""): RawAd[] {
  const trimmed = body.trim();
  const looksHtml =
    /^<!DOCTYPE html/i.test(trimmed) ||
    /^<html[\s>]/i.test(trimmed) ||
    /<script id="__NEXT_DATA__"/i.test(trimmed);
  if (looksHtml || /kijiji\.ca/i.test(sourceUrl)) {
    const kijiji = parseKijijiSearchHtml(body);
    if (kijiji.length) return kijiji;
  }
  if (/<(rss|feed|item|entry)\b/i.test(trimmed)) {
    return parseFeed(body);
  }
  // Last resort: any listing URLs in a non-feed document
  if (looksHtml) {
    const urls = [...new Set((body.match(LISTING_URL_RE) ?? []).map(canonicalUrl))];
    return urls.map((url) => ({
      externalId: listingIdFromUrl(url),
      url,
      title: cleanTitle(url.split("/").filter(Boolean).pop() ?? url).replace(/-/g, " ").slice(0, 120),
      body: "",
      postedAt: null,
    }));
  }
  return parseFeed(body);
}

export type AlertEmailInput = {
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  messageId?: string;
  receivedAt?: string;
};

/**
 * Turn a listing-alert email into RawAds. Kijiji/Craigslist alerts contain
 * one anchor per listing; we take each anchor's text as the title and the
 * text up to the next anchor as the body. Anything else becomes one ad.
 */
export function parseAlertEmail(input: AlertEmailInput): RawAd[] {
  const html = input.html ?? "";
  const text = input.text ?? (html ? stripHtml(html) : "");
  const seen = new Set<string>();
  const ads: RawAd[] = [];

  if (html) {
    const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const anchors: Array<{ url: string; title: string; index: number; end: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = anchorRe.exec(html))) {
      if (!m[1].match(LISTING_URL_RE)) continue;
      const title = stripHtml(m[2]);
      if (title.length < 4 || /^(view|see|open|more|details|photo)/i.test(title)) continue;
      anchors.push({ url: canonicalUrl(m[1]), title, index: m.index, end: m.index + m[0].length });
    }
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      const id = listingIdFromUrl(a.url);
      if (seen.has(id)) continue;
      seen.add(id);
      const until = anchors[i + 1]?.index ?? Math.min(html.length, a.end + 2500);
      const body = stripHtml(html.slice(a.end, until)).slice(0, 1200);
      const contacts = extractContacts(body);
      ads.push({
        externalId: id,
        url: a.url,
        title: a.title,
        body,
        postedAt: input.receivedAt ?? null,
        contactEmail: contacts.email,
        contactPhone: contacts.phone,
      });
    }
  }

  if (!ads.length && text) {
    const urls = [...new Set((text.match(LISTING_URL_RE) ?? []).map(canonicalUrl))];
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    for (const url of urls) {
      const id = listingIdFromUrl(url);
      if (seen.has(id)) continue;
      seen.add(id);
      const idx = lines.findIndex((l) => l.includes(url));
      let title = "";
      for (let j = idx - 1; j >= 0 && j >= idx - 3; j--) {
        if (lines[j] && !LISTING_URL_RE.test(lines[j]) && lines[j].length > 3) {
          title = lines[j];
          break;
        }
      }
      const body = lines
        .slice(idx + 1, idx + 6)
        .filter((l) => !l.match(LISTING_URL_RE))
        .join("\n")
        .slice(0, 1200);
      const contacts = extractContacts(body);
      ads.push({
        externalId: id,
        url,
        title: title || cleanTitle(input.subject),
        body,
        postedAt: input.receivedAt ?? null,
        contactEmail: contacts.email,
        contactPhone: contacts.phone,
      });
    }
  }

  if (!ads.length && (input.subject || text)) {
    const contacts = extractContacts(`${input.subject}\n${text}`);
    // Only trust the sender as the contact when it is a person, not a platform / no-reply address
    const senderIsPlatform = !input.from || SYSTEM_SENDER_RE.test(input.from);
    const title = cleanTitle(input.subject) || text.slice(0, 80);
    // Skip alert digests with no listing URL (e.g. "Today's search results for exterior")
    if (!isJunkAdTitle(title) && !JUNK_SEARCH_TITLE_RE.test(title)) {
      ads.push({
        externalId: input.messageId ? `mail:${input.messageId}` : hashText(input.subject + text),
        url: "",
        title,
        body: text.slice(0, 4000),
        postedAt: input.receivedAt ?? null,
        contactEmail: contacts.email || (senderIsPlatform ? "" : input.from?.match(EMAIL_RE)?.[0] ?? ""),
        contactPhone: contacts.phone,
        contactName: senderIsPlatform ? "" : input.from?.replace(/<.*>/, "").replace(/["']/g, "").trim() || "",
      });
    }
  }
  return ads;
}

const JUNK_SEARCH_TITLE_RE =
  /today[\u2019']?s search results for|search results for|google alert|new results for your|saved search|kijiji alerts?:?\s*$|new matches for/i;

const SYSTEM_SENDER_RE =
  /kijiji|craigslist|facebook|homestars|nextdoor|no-?reply|donotreply|notifications?@|alerts?@|mailer|postmaster|newsletter/i;

/** Drop alert-style prefixes so titles read like the ad, not the email. */
export function cleanTitle(subject: string): string {
  return subject
    .replace(/^\s*((re|fw|fwd|new (ad|listing|post)s?|alert|kijiji alerts?)\s*[:\-–]\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------- filtering ------------------------------ */

export function adMatchesSource(source: AdSource, ad: RawAd): boolean {
  const hay = `${ad.title}\n${ad.body}`.toLowerCase();
  if (source.excludeKeywords.some((k) => k && hay.includes(k.toLowerCase()))) return false;
  // Broad Kijiji alerts often include house-for-sale posts that mention a deck/windows.
  if (looksLikeRealEstateNoise(`${ad.title}\n${ad.body}`)) return false;
  if (!source.keywords.length) return true;
  return source.keywords.some((k) => k && hay.includes(k.toLowerCase()));
}

/* -------------------------------- ingest -------------------------------- */

export type IngestContext = { newId: () => string; nowIso: () => string };

/** Add new listings to the store (deduped by externalId / url). Returns the created ones. */
export function ingestRawAds(
  data: AppData,
  source: AdSource,
  raws: RawAd[],
  ctx: IngestContext,
): AdListing[] {
  const known = new Set<string>();
  for (const l of data.adListings) {
    if (l.externalId) known.add(l.externalId);
    if (l.url) known.add(l.url);
  }
  const created: AdListing[] = [];
  for (const raw of raws) {
    if (!adMatchesSource(source, raw)) continue;
    // Empty-URL alert digests like "Today's search results for siding" are junk.
    // Discovery candidates still require a real listing URL.
    const urlOk = isRealHttpUrl(raw.url);
    if ((isJunkAdTitle(raw.title) || JUNK_SEARCH_TITLE_RE.test(raw.title)) && !urlOk) continue;
    if (source.id === "adsrc-discovery" && !urlOk) continue;
    const externalId = raw.externalId || (raw.url ? canonicalUrl(raw.url) : hashText(raw.title + raw.body));
    const url = raw.url ? canonicalUrl(raw.url) : "";
    if (known.has(externalId) || (url && known.has(url))) continue;
    known.add(externalId);
    if (url) known.add(url);
    const listing: AdListing = {
      id: ctx.newId(),
      sourceId: source.id,
      sourceName: source.name,
      externalId,
      url,
      title: raw.title.trim().slice(0, 200),
      body: raw.body.trim(),
      location: raw.location ?? "",
      postedAt: raw.postedAt ?? null,
      fetchedAt: ctx.nowIso(),
      contactName: raw.contactName ?? "",
      contactEmail: raw.contactEmail ?? "",
      contactPhone: raw.contactPhone ?? "",
      status: "new",
      score: 0,
      category: "other",
      jobType: null,
      summary: "",
      reasons: [],
      classifiedBy: null,
      leadId: null,
      outreachIds: [],
      repliedAt: null,
      notes: "",
    };
    data.adListings.unshift(listing);
    created.push(listing);
  }
  if (data.adListings.length > 1000) data.adListings.length = 1000;
  if (created.length) {
    queueWebhook(
      data,
      "ad.received",
      { sourceId: source.id, count: created.length, ids: created.map((c) => c.id) },
      ctx.newId,
      ctx.nowIso,
    );
  }
  return created;
}

export function newAdSource(
  input: Partial<AdSource> & { name: string; type: AdSource["type"] },
  ctx: IngestContext,
): AdSource {
  return {
    id: input.id ?? ctx.newId(),
    name: input.name,
    type: input.type,
    url: input.url ?? "",
    enabled: input.enabled ?? true,
    keywords: input.keywords ?? [],
    excludeKeywords: input.excludeKeywords ?? [],
    region: input.region ?? "Halifax Regional Municipality",
    lastPolledAt: null,
    lastError: null,
    createdAt: ctx.nowIso(),
  };
}

/** Find (or lazily create) the catch-all source used by webhooks / manual paste. */
export function ensureBuiltinSource(
  data: AppData,
  type: "webhook" | "manual",
  ctx: IngestContext,
): AdSource {
  const existing = data.adSources.find((s) => s.type === type);
  if (existing) return existing;
  const src = newAdSource(
    {
      id: type === "webhook" ? "adsrc-webhook" : "adsrc-manual",
      name: type === "webhook" ? "Inbound webhook" : "Manual paste",
      type,
    },
    ctx,
  );
  data.adSources.push(src);
  return src;
}

/**
 * Ensure an enabled IMAP ad source exists so Kijiji / Craigslist / Facebook
 * alert emails are polled by ad_ingest. Does not import imapflow — only
 * checks whether ADS_IMAP_* or SMTP_* credentials are present.
 */
export function ensureImapAdSource(
  data: AppData,
  ctx: IngestContext,
): AdSource | null {
  const disabled = (typeof process !== "undefined" ? process.env?.ADS_IMAP_ENABLED ?? "1" : "1")
    .trim()
    .toLowerCase();
  if (disabled === "0" || disabled === "false" || disabled === "off") return null;

  const user =
    (typeof process !== "undefined"
      ? process.env?.ADS_IMAP_USER?.trim() || process.env?.SMTP_USER?.trim()
      : "") || "";
  const pass =
    (typeof process !== "undefined"
      ? process.env?.ADS_IMAP_PASS?.trim() || process.env?.SMTP_PASS?.trim()
      : "") || "";
  const host =
    (typeof process !== "undefined"
      ? process.env?.ADS_IMAP_HOST?.trim() || process.env?.SMTP_HOST?.trim()
      : "") || "";
  if (!user || !pass || !host) return null;

  const existing = data.adSources.find((s) => s.type === "imap" || s.id === "adsrc-imap");
  if (existing) {
    if (!existing.enabled) existing.enabled = true;
    // Refresh keep/drop lists so broad terms like bare "deck" get replaced by demand recipes.
    existing.keywords = [...DEFAULT_AD_KEEP_KEYWORDS];
    existing.excludeKeywords = [...DEFAULT_AD_EXCLUDE_KEYWORDS];
    return existing;
  }
  const src = newAdSource(
    {
      id: "adsrc-imap",
      name: "Mailbox alerts (Kijiji / Craigslist / Facebook)",
      type: "imap",
      enabled: true,
      keywords: [...DEFAULT_AD_KEEP_KEYWORDS],
      excludeKeywords: [...DEFAULT_AD_EXCLUDE_KEYWORDS],
      region: "Halifax Regional Municipality",
    },
    ctx,
  );
  data.adSources.push(src);
  return src;
}

/**
 * Ensure public RSS/HTML ad sources exist (Reddit, Kijiji search pages, Craigslist).
 * These keep the pipeline discovering listings when IMAP auth is broken.
 * Set ADS_PUBLIC_SOURCES=0 to disable auto-wiring.
 */
export function ensurePublicAdSources(
  data: AppData,
  ctx: IngestContext,
): AdSource[] {
  const disabled = (typeof process !== "undefined" ? process.env?.ADS_PUBLIC_SOURCES ?? "1" : "1")
    .trim()
    .toLowerCase();
  if (disabled === "0" || disabled === "false" || disabled === "off") return [];

  const created: AdSource[] = [];
  for (const def of DEFAULT_PUBLIC_AD_SOURCES) {
    const existing = data.adSources.find((s) => s.id === def.id);
    if (existing) {
      // Refresh URL / filters from code defaults so ops pick up recipe fixes.
      // Do not force-enable — operator may have toggled a blocked source off.
      existing.url = def.url;
      existing.type = def.type;
      existing.name = def.name;
      existing.keywords = [...def.keywords];
      existing.excludeKeywords = [...def.excludeKeywords];
      existing.region = def.region;
      created.push(existing);
      continue;
    }
    const src = newAdSource(
      {
        id: def.id,
        name: def.name,
        type: def.type,
        url: def.url,
        enabled: true,
        keywords: [...def.keywords],
        excludeKeywords: [...def.excludeKeywords],
        region: def.region,
      },
      ctx,
    );
    data.adSources.push(src);
    created.push(src);
  }
  // Retire noisy auto-sources that were replaced (broad "looking for" Kijiji page).
  for (const obsolete of ["adsrc-kijiji-html-looking"]) {
    const s = data.adSources.find((x) => x.id === obsolete);
    if (s) s.enabled = false;
  }
  return created;
}

/** Wire IMAP (when creds exist) + public scrape sources before every ingest. */
export function ensureAdIntakeSources(
  data: AppData,
  ctx: IngestContext,
): { imap: AdSource | null; public: AdSource[] } {
  return {
    imap: ensureImapAdSource(data, ctx),
    public: ensurePublicAdSources(data, ctx),
  };
}
