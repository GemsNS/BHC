/**
 * Facebook Marketplace (HRM) → CRM normalizer.
 *
 * Facebook Marketplace is aggressively anti-bot and normally requires a
 * logged-in session, so there is NO public HTML/RSS source we can poll from the
 * app server. The supported realtime path is an **operator-owned browser
 * sidecar** (scripts/fb-marketplace-scrape.ts) that runs with an ops Facebook
 * session on the production host, scrapes Halifax Marketplace search results,
 * and POSTs normalized listings to /api/ads/inbound with ADS_INBOUND_SECRET.
 *
 * This module is the pure, testable core: it turns scraped listing objects (or
 * an embedded Marketplace JSON blob) into demand-only RawAds, deduped by the
 * existing facebook:<itemId> key. No credentials, cookies, or Playwright here —
 * those live only in the sidecar and are never committed.
 */

import { canonicalUrl, listingIdFromUrl, type RawAd } from "./ad-ingest";
import { looksLikeDemand } from "./lead-search-recipes";

/** One Marketplace card as the browser sidecar extracts it. */
export type FacebookMarketplaceListing = {
  id?: string | number;
  title?: string;
  description?: string;
  url?: string;
  price?: string | number;
  location?: string;
  postedAt?: string | null;
};

/** Marketplace item permalink for an id. */
export function marketplaceItemUrl(id: string | number): string {
  return `https://www.facebook.com/marketplace/item/${String(id).trim()}`;
}

/**
 * Halifax Marketplace search URL for the sidecar to open. Kept as the city
 * slug + query; the sidecar (not the app server) is what actually loads it.
 */
export function buildMarketplaceSearchUrl(query: string, citySlug = "halifax"): string {
  return `https://www.facebook.com/marketplace/${citySlug}/search?query=${encodeURIComponent(query.trim())}&sortBy=creation_time_descend`;
}

/** Demand-intent queries for the sidecar to run against HRM Marketplace. */
export const FACEBOOK_DEMAND_QUERIES: readonly string[] = [
  "looking for siding contractor",
  "need deck builder",
  "window replacement",
  "soffit fascia repair",
  "exterior renovation contractor",
] as const;

/** True when a scraped listing reads like homeowner demand, not supply / for-sale. */
export function isFacebookDemandAd(ad: Pick<RawAd, "title" | "body">): boolean {
  return looksLikeDemand(`${ad.title ?? ""}\n${ad.body ?? ""}`);
}

/** Convert one scraped Marketplace card to a RawAd (or null if unusable). */
export function facebookListingToRawAd(item: FacebookMarketplaceListing): RawAd | null {
  const title = String(item.title ?? "").trim();
  if (!title) return null;
  const url =
    (item.url && item.url.trim()) ||
    (item.id != null ? marketplaceItemUrl(item.id) : "");
  const externalId = url ? listingIdFromUrl(url) : item.id != null ? `facebook:${item.id}` : "";
  if (!externalId) return null;
  const priceStr =
    item.price != null && String(item.price).trim()
      ? `Listed price: ${typeof item.price === "number" ? `$${item.price}` : String(item.price)}`
      : "";
  const body = [String(item.description ?? "").trim(), priceStr].filter(Boolean).join("\n").slice(0, 4000);
  return {
    externalId,
    url: url ? canonicalUrl(url) : "",
    title: title.slice(0, 200),
    body,
    location: String(item.location ?? "").trim(),
    postedAt: item.postedAt && !Number.isNaN(Date.parse(item.postedAt)) ? new Date(item.postedAt).toISOString() : null,
  };
}

/**
 * Normalize scraped Marketplace listings into RawAds.
 * demandOnly (default true) keeps only homeowner "looking for" posts and drops
 * contractor supply / for-sale items. Deduped by facebook:<itemId>.
 */
export function normalizeFacebookListings(
  items: FacebookMarketplaceListing[],
  opts: { demandOnly?: boolean } = {},
): RawAd[] {
  const demandOnly = opts.demandOnly !== false;
  const seen = new Set<string>();
  const out: RawAd[] = [];
  for (const item of items ?? []) {
    const raw = facebookListingToRawAd(item);
    if (!raw) continue;
    if (demandOnly && !isFacebookDemandAd(raw)) continue;
    const key = raw.externalId || raw.url || raw.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

/* ---------------------- best-effort embedded JSON ----------------------- */

/**
 * Walk an arbitrary Marketplace JSON blob (as embedded in page <script> tags or
 * returned by GraphQL) and collect listing-shaped nodes. Facebook keys the title
 * as `marketplace_listing_title`; we anchor on that and pull nearby fields.
 * Best-effort and defensive — shape drift just yields fewer results, never throws.
 */
export function parseMarketplaceSearchJson(json: unknown): FacebookMarketplaceListing[] {
  const out: FacebookMarketplaceListing[] = [];
  const seen = new Set<unknown>();

  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const el of node) visit(el);
      return;
    }
    const obj = node as Record<string, unknown>;
    const title =
      (typeof obj.marketplace_listing_title === "string" && obj.marketplace_listing_title) ||
      (typeof obj.custom_title === "string" && obj.custom_title) ||
      "";
    if (title) {
      const id =
        (obj.id as string | number | undefined) ??
        (obj.legacy_id as string | number | undefined) ??
        undefined;
      const priceObj = obj.listing_price as Record<string, unknown> | undefined;
      const price =
        (priceObj && (priceObj.formatted_amount as string)) ??
        (priceObj && (priceObj.amount as string)) ??
        undefined;
      const loc = obj.location_text as Record<string, unknown> | undefined;
      out.push({
        id,
        title,
        description: typeof obj.redacted_description === "object" && obj.redacted_description
          ? String((obj.redacted_description as Record<string, unknown>).text ?? "")
          : typeof obj.description === "string"
            ? obj.description
            : "",
        price,
        location: loc && typeof loc.text === "string" ? loc.text : typeof obj.location === "string" ? obj.location : "",
        url: id != null ? marketplaceItemUrl(id) : undefined,
      });
    }
    for (const v of Object.values(obj)) visit(v);
  };

  visit(json);
  return out;
}
