/**
 * Realtime Kijiji **demand** intake for HRM exterior work.
 *
 * The default public Kijiji sources (lead-search-recipes → DEFAULT_PUBLIC_AD_SOURCES)
 * point at broad "Services" category pages, which are dominated by contractor
 * *supply* ads ("we install siding, free estimates"). This module adds
 * intent-first search sources (newest first) whose source-level keep-list is the
 * demand intent phrases and whose exclude-list drops supply + real-estate noise,
 * so only homeowner "looking for / need a quote" listings survive into the CRM.
 *
 * Two intake paths share the same demand filter:
 *   1. HTML sources polled by the pipeline (ad-pipeline → parseFetchedAdDocument →
 *      parseKijijiSearchHtml), filtered by adMatchesSource against the keep/exclude
 *      lists defined here.
 *   2. An operator browser sidecar (scripts/fb-marketplace-scrape.ts, --site kijiji)
 *      that scrapes from HRM residential egress and POSTs normalized listings to
 *      /api/ads/inbound. normalizeKijijiListings() applies the same demand filter.
 *
 * RawAd is imported as a type only, so there is no runtime import cycle with
 * ad-ingest (which imports KIJIJI_DEMAND_SOURCES as a value).
 */

import type { RawAd } from "./ad-ingest";
import {
  DEFAULT_AD_EXCLUDE_KEYWORDS,
  DEMAND_INTENT_KEYWORDS,
  PUBLIC_HTML_EXTRA_EXCLUDE,
  type PublicAdSourceDef,
  looksLikeDemand,
} from "./lead-search-recipes";

/** Kijiji Services category (c72) scoped to Halifax Regional Municipality (l1700321). */
export const KIJIJI_HRM_SERVICES_PATH = "k0c72l1700321";

/**
 * Build a Kijiji Services search URL for a free-text query, sorted newest-first.
 * Kijiji puts the query in the URL slug; we also pass ?keywords= for resilience
 * if the slug form is redirected.
 */
export function buildKijijiServicesUrl(query: string): string {
  const slug =
    query
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "services";
  const kw = encodeURIComponent(query.trim());
  return `https://www.kijiji.ca/b-services/city-of-halifax/${slug}/${KIJIJI_HRM_SERVICES_PATH}?sort=dateDesc&keywords=${kw}`;
}

/** Demand-intent queries a homeowner would phrase (not a contractor selling). */
export const KIJIJI_DEMAND_QUERIES: readonly string[] = [
  "looking for siding contractor",
  "need a deck built",
  "window replacement quote",
  "soffit fascia repair needed",
  "exterior contractor wanted",
] as const;

/** Keep-list = demand intent phrases; exclude-list = supply + noise. */
const DEMAND_KEEP = [...DEMAND_INTENT_KEYWORDS];
const DEMAND_EXCLUDE = [...DEFAULT_AD_EXCLUDE_KEYWORDS, ...PUBLIC_HTML_EXTRA_EXCLUDE];

/**
 * Realtime demand HTML sources, auto-wired by ensurePublicAdSources. These are
 * intent-first searches, unlike the trade-only DEFAULT_PUBLIC_AD_SOURCES.
 */
export const KIJIJI_DEMAND_SOURCES: PublicAdSourceDef[] = [
  {
    id: "adsrc-kijiji-demand-siding",
    name: "Kijiji HRM — homeowner asks: siding / soffit / fascia",
    type: "html",
    url: buildKijijiServicesUrl("looking for siding soffit fascia"),
    keywords: DEMAND_KEEP,
    excludeKeywords: DEMAND_EXCLUDE,
    region: "Halifax Regional Municipality",
  },
  {
    id: "adsrc-kijiji-demand-deck",
    name: "Kijiji HRM — homeowner asks: deck build / repair",
    type: "html",
    url: buildKijijiServicesUrl("need a deck built or repaired"),
    keywords: DEMAND_KEEP,
    excludeKeywords: DEMAND_EXCLUDE,
    region: "Halifax Regional Municipality",
  },
  {
    id: "adsrc-kijiji-demand-windows",
    name: "Kijiji HRM — homeowner asks: windows / doors",
    type: "html",
    url: buildKijijiServicesUrl("window replacement quote"),
    keywords: DEMAND_KEEP,
    excludeKeywords: DEMAND_EXCLUDE,
    region: "Halifax Regional Municipality",
  },
  {
    id: "adsrc-kijiji-demand-contractor",
    name: "Kijiji HRM — homeowner asks: exterior contractor wanted",
    type: "html",
    url: buildKijijiServicesUrl("exterior contractor wanted"),
    keywords: DEMAND_KEEP,
    excludeKeywords: DEMAND_EXCLUDE,
    region: "Halifax Regional Municipality",
  },
];

/** True when a scraped listing reads like homeowner demand (not contractor supply). */
export function isKijijiDemandAd(ad: Pick<RawAd, "title" | "body">): boolean {
  return looksLikeDemand(`${ad.title ?? ""}\n${ad.body ?? ""}`);
}

/**
 * Normalize sidecar-scraped Kijiji listings into demand-only RawAds.
 * Input is whatever the browser sidecar extracted per card; only listings that
 * pass the demand filter are returned, ready to POST to /api/ads/inbound.
 */
export function normalizeKijijiListings(raws: RawAd[]): RawAd[] {
  const seen = new Set<string>();
  const out: RawAd[] = [];
  for (const raw of raws) {
    if (!raw?.title) continue;
    if (!isKijijiDemandAd(raw)) continue;
    const key = raw.externalId || raw.url || raw.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}
