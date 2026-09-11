/**
 * Demand-side lead intake recipes for HRM exterior work.
 *
 * Kijiji / Marketplace alerts keyed only on "deck" or "window" pull real-estate
 * and for-sale noise. Prefer intent phrases + trade terms, and exclude housing ads.
 */

/** Trade / scope terms (safe as OR matches once excludes run). */
export const DEMAND_TRADE_KEYWORDS = [
  "siding",
  "vinyl siding",
  "hardie",
  "soffit",
  "fascia",
  "eavestrough",
  "eaves trough",
  "gutter",
  "cladding",
  "exterior trim",
  "building envelope",
  "deck build",
  "deck rebuilt",
  "deck repair",
  "new deck",
  "need a deck",
  "looking for a deck",
  "window replacement",
  "windows replaced",
  "new windows",
  "door install",
  "entry door",
  "patio door",
] as const;

/** Intent phrases that signal someone is asking for work (not selling a house). */
export const DEMAND_INTENT_KEYWORDS = [
  "looking for",
  "looking for someone",
  "need a quote",
  "need quotes",
  "need a contractor",
  "need contractor",
  "contractor needed",
  "contractor wanted",
  "anyone recommend",
  "recommendations for",
  "who can",
  "someone to",
  "hire a",
  "want a quote",
  "get quotes",
  "seeking contractor",
  "need help with",
] as const;

/** Default keep-list for IMAP / webhook sources. */
export const DEFAULT_AD_KEEP_KEYWORDS: string[] = [
  ...DEMAND_TRADE_KEYWORDS,
  ...DEMAND_INTENT_KEYWORDS,
];

/**
 * Drop real-estate / supply / hiring noise that broad Kijiji searches return.
 * Matched as case-insensitive substring against title+body.
 */
export const DEFAULT_AD_EXCLUDE_KEYWORDS: string[] = [
  // Real estate / for-sale homes (decks & windows on house listings)
  "for sale",
  "house for sale",
  "home for sale",
  "condo for sale",
  "townhouse for sale",
  "open house",
  "mls",
  "realtor",
  "real estate",
  "asking price",
  "property taxes",
  "lot size",
  "virtual tour",
  "book a showing",
  "motivated seller",
  // Contractor supply ads
  "we install",
  "we offer",
  "free estimates",
  "call us today",
  "licensed and insured",
  "now booking",
  "our services",
  "years experience",
  // Hiring / jobs
  "hiring",
  "job posting",
  "apply now",
  "resume",
  "wage",
  "$/hr",
  "per hour",
];

/** Claude web-discovery queries — demand language + platforms. */
export const DEFAULT_DISCOVERY_QUERIES: string[] = [
  // Kijiji — Services Wanted / skilled trades intent
  'site:kijiji.ca "looking for" (siding OR soffit OR fascia OR "vinyl siding") (Halifax OR Dartmouth OR Bedford OR Sackville)',
  'site:kijiji.ca ("need a quote" OR "looking for contractor" OR "anyone recommend") (deck OR siding OR windows) (Halifax OR Dartmouth)',
  'site:kijiji.ca "contractor needed" OR "contractor wanted" (exterior OR siding OR deck) Nova Scotia',
  // Craigslist Halifax
  'site:halifax.craigslist.org (wanted OR "looking for") (siding OR deck OR soffit OR "window replacement")',
  'site:craigslist.org Halifax "need someone" (siding OR deck OR gutters)',
  // Facebook Marketplace / groups (often indexed thinly — still worth trying)
  'site:facebook.com/marketplace Halifax ("looking for" OR "need quote") (siding OR deck OR windows)',
  '"looking for siding contractor" OR "need soffit replaced" Halifax OR Dartmouth',
  // Community / referral boards
  'site:reddit.com/r/halifax ("looking for" OR recommend) (siding OR deck OR contractor OR exterior)',
  'site:homestars.com Halifax (siding OR soffit OR deck) request OR quote',
  'site:nextdoor.com Halifax (siding OR deck OR windows) "looking for" OR recommend',
  '"need deck built" OR "deck repaired" quote (Dartmouth OR Bedford OR Sackville OR "Cole Harbour")',
  '"window replacement" quote homeowner Halifax -realtor -MLS -"for sale"',
];

export const DEFAULT_DISCOVERY_DOMAINS: string[] = [
  "kijiji.ca",
  "craigslist.org",
  "facebook.com",
  "homestars.com",
  "reddit.com",
  "nextdoor.com",
];

/**
 * Built-in public sources that work without IMAP (Kijiji alert mailbox).
 * Auto-created by ensurePublicAdSources so the CRM still discovers ads when
 * Office 365 blocks basic IMAP ("Login is disabled").
 *
 * - Reddit Atom feeds: work from most hosts
 * - Kijiji HTML search pages: parse __NEXT_DATA__ StandardListing cards
 * - Craigslist RSS: often blocked from cloud IPs; kept for production HRM hosts
 */
export type PublicAdSourceDef = {
  id: string;
  name: string;
  type: "rss" | "html";
  url: string;
  /** Empty = keep all (minus excludes). Prefer empty for already-narrow search feeds. */
  keywords: string[];
  excludeKeywords: string[];
  region: string;
};

/** Lighter keep-list for open scrapes (OR match). */
export const PUBLIC_SCRAPE_KEEP_KEYWORDS: string[] = [
  "looking for",
  "recommend",
  "how much",
  "need a quote",
  "need quote",
  "contractor",
  "siding",
  "soffit",
  "fascia",
  "gutter",
  "eavestrough",
  "deck",
  "window",
  "exterior",
  "reno",
  "handyman",
];

/** Extra noise to drop from broad Kijiji HTML searches (services category is noisy). */
export const PUBLIC_HTML_EXTRA_EXCLUDE: string[] = [
  "tutor",
  "piano",
  "guitar",
  "website",
  "web design",
  "web designer",
  "loan",
  "business plan",
  "smart tv",
  "care giver",
  "caregiver",
  "cleaning service",
  "junk removal",
  "math tutor",
  "dog walk",
  "pet sitting",
];

export const DEFAULT_PUBLIC_AD_SOURCES: PublicAdSourceDef[] = [
  {
    id: "adsrc-reddit-halifax-demand",
    name: "Reddit r/halifax — contractor / exterior asks",
    type: "rss",
    url: "https://www.reddit.com/r/halifax/search.rss?q=looking%20for%20OR%20recommend%20(siding%20OR%20deck%20OR%20contractor%20OR%20windows%20OR%20gutter%20OR%20soffit)&restrict_sr=1&sort=new",
    keywords: [],
    excludeKeywords: [...DEFAULT_AD_EXCLUDE_KEYWORDS],
    region: "Halifax Regional Municipality",
  },
  {
    id: "adsrc-reddit-halifax-trades",
    name: "Reddit r/halifax — siding / deck / windows mentions",
    type: "rss",
    url: "https://www.reddit.com/r/halifax/search.rss?q=siding%20OR%20%22deck%20repair%22%20OR%20soffit%20OR%20%22window%20replacement%22%20OR%20gutters%20OR%20eavestrough&restrict_sr=1&sort=new",
    keywords: [...PUBLIC_SCRAPE_KEEP_KEYWORDS],
    excludeKeywords: [...DEFAULT_AD_EXCLUDE_KEYWORDS],
    region: "Halifax Regional Municipality",
  },
  {
    id: "adsrc-kijiji-html-siding",
    name: "Kijiji HRM Services — siding / soffit search",
    type: "html",
    url: "https://www.kijiji.ca/b-services/city-of-halifax/siding/k0c72l1700321?sort=dateDesc",
    keywords: [...PUBLIC_SCRAPE_KEEP_KEYWORDS],
    excludeKeywords: [...DEFAULT_AD_EXCLUDE_KEYWORDS, ...PUBLIC_HTML_EXTRA_EXCLUDE],
    region: "Halifax Regional Municipality",
  },
  {
    id: "adsrc-kijiji-html-deck",
    name: "Kijiji HRM Services — deck search",
    type: "html",
    url: "https://www.kijiji.ca/b-services/city-of-halifax/deck/k0c72l1700321?sort=dateDesc",
    keywords: [...PUBLIC_SCRAPE_KEEP_KEYWORDS],
    excludeKeywords: [...DEFAULT_AD_EXCLUDE_KEYWORDS, ...PUBLIC_HTML_EXTRA_EXCLUDE],
    region: "Halifax Regional Municipality",
  },
  {
    id: "adsrc-kijiji-html-windows",
    name: "Kijiji HRM Services — windows / doors search",
    type: "html",
    url: "https://www.kijiji.ca/b-services/city-of-halifax/windows/k0c72l1700321?sort=dateDesc",
    keywords: [...PUBLIC_SCRAPE_KEEP_KEYWORDS],
    excludeKeywords: [...DEFAULT_AD_EXCLUDE_KEYWORDS, ...PUBLIC_HTML_EXTRA_EXCLUDE],
    region: "Halifax Regional Municipality",
  },
  {
    id: "adsrc-craigslist-halifax-lab",
    name: "Craigslist Halifax — labor gigs RSS",
    type: "rss",
    url: "https://halifax.craigslist.org/search/lab?format=rss",
    keywords: [...PUBLIC_SCRAPE_KEEP_KEYWORDS],
    excludeKeywords: [...DEFAULT_AD_EXCLUDE_KEYWORDS],
    region: "Halifax Regional Municipality",
  },
  {
    id: "adsrc-craigslist-halifax-bbb",
    name: "Craigslist Halifax — services RSS (siding/deck)",
    type: "rss",
    url: "https://halifax.craigslist.org/search/bbb?query=siding|deck|soffit|gutter|windows&format=rss",
    keywords: [...PUBLIC_SCRAPE_KEEP_KEYWORDS],
    excludeKeywords: [...DEFAULT_AD_EXCLUDE_KEYWORDS],
    region: "Halifax Regional Municipality",
  },
];

/**
 * Kijiji saved searches the operator should create (email → CRM mailbox).
 * Category path matters more than a single broad keyword.
 */
export type SavedSearchRecipe = {
  platform: "kijiji" | "craigslist" | "facebook" | "homestars" | "reddit" | "nextdoor" | "google_alerts";
  name: string;
  how: string;
  query: string;
};

export const SAVED_SEARCH_RECIPES: SavedSearchRecipe[] = [
  {
    platform: "kijiji",
    name: "Services Wanted — siding quote",
    how: "Kijiji → Services → Skilled Trades (or Services Wanted). Location: Halifax R.M. Offer type: OFFERED BY — actually pick Wanted / Looking to hire if available. Email alerts → CRM mailbox.",
    query: `"looking for" OR "need quote" OR "need a quote" siding OR "vinyl siding" OR soffit OR fascia`,
  },
  {
    platform: "kijiji",
    name: "Services Wanted — deck build/repair",
    how: "Same category. Do NOT use bare keyword “deck” in Buy & Sell / Real Estate.",
    query: `("looking for" OR "need someone" OR "need a quote") (deck OR "deck repair" OR "new deck") -"for sale" -MLS -bedroom`,
  },
  {
    platform: "kijiji",
    name: "Services Wanted — windows/doors install",
    how: "Services / Skilled Trades only — never Real Estate.",
    query: `("window replacement" OR "new windows" OR "patio door") ("looking for" OR quote OR contractor)`,
  },
  {
    platform: "craigslist",
    name: "Halifax services — skilled trade wanted",
    how: "halifax.craigslist.org → services → skilled trade · or “wanted” section. Enable email alerts.",
    query: `siding OR soffit OR "deck repair" OR "window replacement"`,
  },
  {
    platform: "facebook",
    name: "Marketplace + HRM groups",
    how: "Facebook Marketplace alerts are weak by email. Prefer: (1) Marketplace saved search notifications to facebookmail.com, (2) join HRM Buy/Sell + “Halifax Homeowners” style groups and turn on notifications, (3) forward alert emails to the CRM mailbox or POST /api/ads/inbound.",
    query: `looking for contractor OR need quote — siding / deck / windows — Halifax`,
  },
  {
    platform: "homestars",
    name: "HomeStars / similar request boards",
    how: "Create pro profile if needed; enable email for new homeowner requests in HRM for siding/decks/windows.",
    query: `HRM · Exterior · Siding / Decks / Windows`,
  },
  {
    platform: "reddit",
    name: "r/halifax recommendations",
    how: "Use Reddit RSS or F5Bot/Google Alerts on the query below; pipe into IMAP or inbound webhook.",
    query: `site:reddit.com/r/halifax (siding OR deck OR contractor OR "looking for")`,
  },
  {
    platform: "google_alerts",
    name: "Google Alerts backup",
    how: "google.com/alerts → deliver as they happen → CRM mailbox. Good safety net when Kijiji digest HTML is link-poor.",
    query: `"looking for" (siding OR soffit OR "deck built") (Halifax OR Dartmouth OR Bedford)`,
  },
];

/** Real-estate / for-sale listing detector for classifier + ingest. */
export const REAL_ESTATE_SALE_RE =
  /\b(for sale|house for sale|home for sale|condo for sale|open house|\bmls\b|realtor|real estate|asking price|property taxes|lot size|virtual tour|book a showing|motivated seller)\b/i;

export const REAL_ESTATE_HOME_DETAILS_RE =
  /\b(\d+\s*bed(room)?s?|\d+\s*bath(room)?s?|sq\.?\s?ft|square feet)\b/i;

export function looksLikeRealEstateNoise(text: string): boolean {
  // "1200 sq ft bungalow needs siding" is a job — only treat as real-estate when
  // sale language is present, or sale-ish details stack with listing jargon.
  if (REAL_ESTATE_SALE_RE.test(text)) return true;
  const details = text.match(REAL_ESTATE_HOME_DETAILS_RE);
  if (!details) return false;
  // Multiple home-detail signals without demand intent → likely a listing.
  const detailCount = (text.match(/\b(\d+\s*bed(room)?s?|\d+\s*bath(room)?s?|sq\.?\s?ft|square feet)\b/gi) ?? []).length;
  return detailCount >= 2 && !/\b(looking for|need(ed|ing)? a? ?quote|contractor|repair|replace|install)\b/i.test(text);
}

/* --------------------------- demand vs supply --------------------------- */

/**
 * Contractor **supply** ads — someone advertising that THEY do the work.
 * These are the dominant noise on Kijiji "Services" search pages and on
 * Facebook Marketplace. We drop them at the source level so the classifier
 * (and any auto-send) never sees them.
 */
export const SUPPLY_AD_RE =
  /\b(we (install|offer|provide|specialize|do|build|repair)|our (team|crew|services|company)|free estimates?|call us(\s+today)?|licensed (and|&) insured|fully insured|now booking|book (now|today)|years? (of )?experience|serving (hrm|halifax|nova scotia)|accepting new (clients|customers)|hire us|we come to you|no job too (big|small)|satisfaction guaranteed|competitive (rates|pricing)|for a free quote|contact us for)\b/i;

/**
 * Homeowner **demand** intent — someone asking for work / a quote / a referral.
 * Deliberately requires an ask phrase, not just a trade term, so "vinyl siding
 * for sale" or "we install siding" never counts as demand.
 */
export const DEMAND_INTENT_RE =
  /\b(looking for|need(ed|ing)?\s+(a\s+|an\s+|some\s+)?(quote|contractor|help|someone|estimate)|need\s+a?\s*quote|want(ed)?\s+(a\s+)?quote|get(ting)?\s+quotes|anyone\s+recommend|recommendations?\s+for|who\s+(can|does)|someone\s+to|seeking\s+(a\s+)?(contractor|quote|installer)|contractor\s+(wanted|needed)|installer\s+(wanted|needed)|hire\s+(a|someone)|in\s+search\s+of|iso\b|price\s+to)\b/i;

/**
 * True when the text reads like a homeowner asking for exterior work — demand
 * intent present, no supply pitch, and not a real-estate / for-sale listing.
 * Used by the realtime Kijiji + Facebook Marketplace ingest paths so only
 * demand-side listings enter the CRM pipeline.
 */
export function looksLikeDemand(text: string): boolean {
  if (!text) return false;
  if (looksLikeRealEstateNoise(text)) return false;
  if (SUPPLY_AD_RE.test(text)) return false;
  return DEMAND_INTENT_RE.test(text);
}

/** True when the text mentions any exterior trade BHC actually does. */
export function mentionsExteriorTrade(text: string): boolean {
  if (!text) return false;
  const hay = text.toLowerCase();
  return DEMAND_TRADE_KEYWORDS.some((k) => hay.includes(k.toLowerCase()));
}
