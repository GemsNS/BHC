/**
 * Lead scout platform adapters — pure request builders + parsers with the
 * fetcher injected, so the own-PC runner (`scripts/lead-scout.ts`), the tests,
 * and any future server-side sweep share one implementation.
 *
 * No Playwright here: Facebook Marketplace needs a logged-in browser session and
 * lives only in the runner script. Every other platform is plain HTTPS + HTML /
 * RSS / JSON parsing.
 */

import {
  canonicalUrl,
  listingIdFromUrl,
  parseFeed,
  parseKijijiSearchHtml,
  stripHtml,
  type RawAd,
} from "./ad-ingest";
import { buildKijijiServicesUrl } from "./kijiji-realtime";
import { scoutRawLooksLikeDemand, SCOUT_DEFAULT_REGION } from "./lead-scout";
import type { ScoutPlatform } from "./types";

export const SCOUT_USER_AGENT = "BHC-LeadScout/1.0 (+https://bhcontracting.ca)";

/** Result hosts the generic web adapter keeps (listing / community boards). */
export const SCOUT_WEB_ALLOWED_DOMAINS: string[] = [
  "kijiji.ca",
  "craigslist.org",
  "reddit.com",
  "facebook.com",
  "homestars.com",
  "nextdoor.com",
];

/** "Halifax Regional Municipality" → "Halifax" for search phrasing. */
function shortRegion(region: string): string {
  const r = region.trim();
  if (!r) return "Halifax";
  return r.split(/[,(]/)[0].replace(/regional municipality/i, "").trim() || "Halifax";
}

/** URLs to fetch for one query on one platform (facebook = none; browser-only). */
export function scoutRequestUrls(
  platform: ScoutPlatform,
  query: string,
  region: string = SCOUT_DEFAULT_REGION,
): string[] {
  const q = query.trim();
  if (!q) return [];
  const enc = encodeURIComponent(q);
  switch (platform) {
    case "kijiji":
      // Kijiji ANDs every word, so a long intent phrase returns 0 ads; try the
      // phrase first, then the bare trade terms (the demand filter does the rest).
      return kijijiQueryVariants(q).map((v) => buildKijijiServicesUrl(v));
    case "craigslist":
      // Craigslist retired RSS in 2023; the search page still ships a no-JS
      // "cl-static-search-result" list. sss = everything, ggg = gigs (demand).
      return [
        `https://halifax.craigslist.org/search/sss?query=${enc}`,
        `https://halifax.craigslist.org/search/ggg?query=${enc}`,
      ];
    case "reddit":
      // search.json answers 403 to non-browser clients; the Atom feed does not.
      return [
        `https://www.reddit.com/r/halifax/search.rss?q=${enc}&restrict_sr=1&sort=new&t=month`,
      ];
    case "web": {
      const short = shortRegion(region);
      const withRegion = new RegExp(`\\b${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(q)
        ? q
        : `${q} ${short}`;
      return [`https://html.duckduckgo.com/html/?q=${encodeURIComponent(withRegion)}`];
    }
    case "facebook":
    default:
      return [];
  }
}

/* --------------------------------- kijiji -------------------------------- */

const KIJIJI_CORE_TERMS = [
  "siding",
  "soffit",
  "fascia",
  "deck",
  "decks",
  "window",
  "windows",
  "door",
  "doors",
  "gutter",
  "gutters",
  "eavestrough",
  "eavestroughs",
  "exterior",
  "trim",
  "cladding",
  "envelope",
  "contractor",
  "renovation",
  "reno",
];

/**
 * Query variants for Kijiji: the phrase as given, then just its trade terms
 * (e.g. "looking for siding contractor" → "siding contractor"). Kijiji ANDs all
 * words, so intent phrases alone usually return nothing.
 */
export function kijijiQueryVariants(query: string): string[] {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q) return [];
  const words = q.toLowerCase().split(" ");
  const core = words.filter((w) => KIJIJI_CORE_TERMS.includes(w.replace(/[^a-z]/g, "")));
  const variants = [q];
  const reduced = core.join(" ");
  if (reduced && reduced !== q.toLowerCase() && words.length > core.length) variants.push(reduced);
  return variants;
}

/* ------------------------------- craigslist ------------------------------ */

/**
 * Parse the no-JS `cl-static-search-result` list on a Craigslist search page.
 * Each item: `<li class="cl-static-search-result" title="…"><a href="…"><div class="title">…</div>
 * <div class="details"><div class="price">…</div><div class="location">…</div></div></a></li>`.
 */
export function parseCraigslistStaticHtml(html: string): RawAd[] {
  const out: RawAd[] = [];
  const seen = new Set<string>();
  const itemRe = /<li\b[^>]*class=["'][^"']*cl-static-search-result[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(html))) {
    const block = m[1];
    const href = block.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1] ?? "";
    if (!/^https?:\/\//i.test(href)) continue;
    const title = stripHtml(block.match(/<div\b[^>]*class=["']title["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "");
    if (!title) continue;
    const location = stripHtml(block.match(/<div\b[^>]*class=["']location["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "");
    const price = stripHtml(block.match(/<div\b[^>]*class=["']price["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "");
    const url = canonicalUrl(href);
    const id = listingIdFromUrl(url);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      externalId: id,
      url,
      title: title.slice(0, 200),
      body: price && price !== "$0" ? `Listed price: ${price}` : "",
      postedAt: null,
      location: location || "Halifax",
    });
  }
  return out;
}

/* --------------------------------- reddit -------------------------------- */

type RedditChild = {
  data?: {
    id?: string;
    title?: string;
    selftext?: string;
    permalink?: string;
    url?: string;
    created_utc?: number;
    author?: string;
  };
};

/** Parse `search.json` / listing JSON from Reddit into RawAds (shape-tolerant). */
export function parseRedditSearchJson(json: unknown): RawAd[] {
  const out: RawAd[] = [];
  if (!json || typeof json !== "object") return out;
  const root = json as { data?: { children?: RedditChild[] }; children?: RedditChild[] };
  const children = root.data?.children ?? root.children ?? [];
  if (!Array.isArray(children)) return out;
  const seen = new Set<string>();
  for (const child of children) {
    const d = child?.data;
    if (!d || typeof d !== "object") continue;
    const title = String(d.title ?? "").trim();
    if (!title) continue;
    const permalink = typeof d.permalink === "string" ? d.permalink : "";
    const url = permalink
      ? `https://www.reddit.com${permalink.startsWith("/") ? "" : "/"}${permalink}`
      : typeof d.url === "string" && /reddit\.com/i.test(d.url)
        ? d.url
        : "";
    if (!url) continue;
    const id = typeof d.id === "string" && d.id ? `reddit:${d.id}` : listingIdFromUrl(url);
    if (seen.has(id)) continue;
    seen.add(id);
    const created =
      typeof d.created_utc === "number" && Number.isFinite(d.created_utc)
        ? new Date(d.created_utc * 1000).toISOString()
        : null;
    out.push({
      externalId: id,
      url: canonicalUrl(url),
      title: title.slice(0, 200),
      body: String(d.selftext ?? "").trim().slice(0, 4000),
      postedAt: created,
      location: "Halifax",
      contactName: typeof d.author === "string" ? d.author : "",
    });
  }
  return out;
}

/* ------------------------------- duckduckgo ------------------------------ */

function hostAllowed(url: string, allowed: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowed.some((d) => {
      const dom = d.toLowerCase().replace(/^\*?\./, "");
      return host === dom || host.endsWith(`.${dom}`);
    });
  } catch {
    return false;
  }
}

/** Unwrap `//duckduckgo.com/l/?uddg=<encoded>&rut=…` redirect links. */
export function unwrapDuckDuckGoHref(href: string): string {
  let h = href.trim();
  if (h.startsWith("//")) h = `https:${h}`;
  try {
    const u = new URL(h, "https://duckduckgo.com");
    if (/duckduckgo\.com$/i.test(u.hostname) && u.pathname.startsWith("/l/")) {
      const target = u.searchParams.get("uddg");
      if (target) return decodeURIComponent(target);
    }
    return u.toString();
  } catch {
    return h;
  }
}

/**
 * Parse DuckDuckGo's HTML endpoint (`html.duckduckgo.com/html/?q=`) into RawAds.
 * Keeps only results on the allowed listing / community domains.
 */
export function parseDuckDuckGoHtml(html: string, allowedDomains: string[] = SCOUT_WEB_ALLOWED_DOMAINS): RawAd[] {
  const out: RawAd[] = [];
  const seen = new Set<string>();
  // Each result sits in a container; split on result anchors so snippets pair up.
  const blocks = html.split(/(?=<a\b[^>]*class=["'][^"']*result__a[^"']*["'])/i);
  for (const block of blocks) {
    const anchor = block.match(/<a\b[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
      ?? block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    const url = unwrapDuckDuckGoHref(anchor[1]);
    if (!/^https?:\/\//i.test(url)) continue;
    if (!hostAllowed(url, allowedDomains)) continue;
    const title = stripHtml(anchor[2]).slice(0, 200);
    if (!title) continue;
    const snippetMatch =
      block.match(/<a\b[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) ??
      block.match(/<(?:div|span|td)\b[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|td)>/i);
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]).slice(0, 2000) : "";
    const id = listingIdFromUrl(url);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      externalId: id,
      url: canonicalUrl(url),
      title,
      body: snippet,
      postedAt: null,
      location: "Halifax",
    });
  }
  return out;
}

/* --------------------------------- parse --------------------------------- */

/** Turn one fetched response body into RawAds for the platform. */
export function parseScoutResponse(platform: ScoutPlatform, body: string, url = ""): RawAd[] {
  switch (platform) {
    case "kijiji":
      return parseKijijiSearchHtml(body);
    case "craigslist": {
      const items = parseCraigslistStaticHtml(body);
      if (items.length) return items;
      return /<(rss|feed|item|entry)\b/i.test(body) ? parseFeed(body) : [];
    }
    case "reddit": {
      const trimmed = body.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          return parseRedditSearchJson(JSON.parse(trimmed) as unknown);
        } catch {
          return [];
        }
      }
      return parseFeed(body);
    }
    case "web":
      return parseDuckDuckGoHtml(body);
    case "facebook":
    default:
      void url;
      return [];
  }
}

/* ---------------------------------- run ---------------------------------- */

export type ScoutQueryResult = {
  raws: RawAd[];
  error: string | null;
  /** 403 / 429 / 503 — the platform is rate-limiting this host; back off. */
  blocked: boolean;
  requests: number;
};

export type ScoutQueryOptions = {
  fetcher?: typeof fetch;
  region?: string;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

const POLITE_GAP_MS = 1500;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function acceptFor(platform: ScoutPlatform): string {
  if (platform === "reddit") return "application/atom+xml, application/rss+xml, application/xml;q=0.9, application/json;q=0.8, */*;q=0.5";
  return "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
}

/**
 * Fetch + parse every URL for a query, dedupe, and keep only homeowner-demand
 * listings. Never throws; network problems land in `error` / `blocked`.
 */
export async function runScoutQuery(
  platform: ScoutPlatform,
  query: string,
  opts: ScoutQueryOptions = {},
): Promise<ScoutQueryResult> {
  const fetcher = opts.fetcher ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const urls = scoutRequestUrls(platform, query, opts.region);
  const result: ScoutQueryResult = { raws: [], error: null, blocked: false, requests: 0 };
  if (!urls.length) {
    result.error = platform === "facebook" ? "facebook needs the browser runner" : "no request URL for query";
    return result;
  }
  const errors: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (i > 0) await sleep(POLITE_GAP_MS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    result.requests += 1;
    try {
      const res = await fetcher(url, {
        headers: {
          "User-Agent": SCOUT_USER_AGENT,
          Accept: acceptFor(platform),
          "Accept-Language": "en-CA,en;q=0.9",
        },
        signal: controller.signal,
        redirect: "follow",
      });
      if (res.status === 403 || res.status === 429 || res.status === 503) {
        result.blocked = true;
        errors.push(`${res.status} from ${new URL(url).hostname}`);
        continue;
      }
      if (!res.ok) {
        errors.push(`HTTP ${res.status} from ${new URL(url).hostname}`);
        continue;
      }
      const body = await res.text();
      const parsed = parseScoutResponse(platform, body, url);
      for (const raw of parsed) {
        const key = raw.externalId || raw.url || raw.title;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (!scoutRawLooksLikeDemand(raw)) continue;
        result.raws.push(raw);
      }
      // Kijiji variants are fallbacks: once a variant returns ads, stop.
      if (platform === "kijiji" && parsed.length) break;
    } catch (err) {
      const msg = err instanceof Error ? (err.name === "AbortError" ? `timeout after ${timeoutMs} ms` : err.message) : String(err);
      errors.push(msg);
    } finally {
      clearTimeout(timer);
    }
  }
  result.error = errors.length ? errors.join("; ").slice(0, 300) : null;
  return result;
}
