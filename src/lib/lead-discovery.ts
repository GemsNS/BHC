import { ensureBuiltinSource, ingestRawAds, type RawAd } from "./ad-ingest";
import { qualifyListing } from "./ad-pipeline";
import { getAnthropicModel } from "./ai-provider";
import { live } from "./events";
import { isJunkAdTitle, isRealContactEmail, isRealHttpUrl } from "./outreach-guard";
import type { AdSource, AppData } from "./types";

/**
 * Internet lead discovery: Claude (with the server-side web_search tool)
 * looks for fresh "looking for a contractor" posts in the service area and
 * returns structured candidates, which then flow through the normal ad
 * pipeline (dedupe → triage → lead → drafted reply).
 *
 * Env:
 *   ANTHROPIC_API_KEY            required
 *   DISCOVERY_MODEL              default = ANTHROPIC_MODEL (claude-opus-5)
 *   DISCOVERY_QUERIES            "|"-separated extra searches
 *   DISCOVERY_MAX_SEARCHES       8 per run (cost guard — ~$0.01 per search + tokens)
 *   DISCOVERY_REGION             "Halifax Regional Municipality, Nova Scotia"
 *   DISCOVERY_ALLOWED_DOMAINS    comma list to restrict search (optional)
 */

export function discoveryConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim() || process.env.CLAUDE_API_KEY?.trim()) && process.env.DISCOVERY_ENABLED !== "0";
}

const DEFAULT_QUERIES = [
  "site:kijiji.ca looking for siding OR deck OR soffit Halifax OR Dartmouth",
  "site:craigslist.org Halifax siding OR deck contractor wanted",
  "site:facebook.com/marketplace Halifax siding OR deck OR windows",
  "looking for siding contractor Halifax Kijiji OR Craigslist OR Marketplace",
  "need deck built quote Dartmouth OR Bedford OR Sackville",
  "recommend exterior contractor HRM Nova Scotia",
  "window replacement quotes Halifax homeowner",
  "soffit fascia repair needed Halifax",
];

const DEFAULT_ALLOWED_DOMAINS = [
  "kijiji.ca",
  "craigslist.org",
  "facebook.com",
  "homestars.com",
  "reddit.com",
  "nextdoor.com",
];

type Candidate = {
  title: string;
  url: string;
  snippet: string;
  location?: string;
  postedAt?: string;
  contactEmail?: string;
  contactPhone?: string;
  confidence?: number;
};

function extractJsonArray(text: string): Candidate[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1)) as unknown;
    return Array.isArray(arr) ? (arr as Candidate[]).filter((c) => c && typeof c.title === "string" && typeof c.url === "string") : [];
  } catch {
    return [];
  }
}

export async function discoverLeadsOnline(
  data: AppData,
  ctx: { newId: () => string; nowIso: () => string; fetcher?: typeof fetch },
): Promise<{ summary: string; created: number; qualified: number; errors: string[] }> {
  const key = process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim() || process.env.CLAUDE_API_KEY?.trim();
  if (!key) return { summary: "Lead discovery: ANTHROPIC_API_KEY not set.", created: 0, qualified: 0, errors: [] };
  const fetcher = ctx.fetcher ?? fetch;
  const region = process.env.DISCOVERY_REGION?.trim() || "Halifax Regional Municipality, Nova Scotia";
  const maxSearches = Math.max(1, Number(process.env.DISCOVERY_MAX_SEARCHES ?? "8") || 8);
  const extra = (process.env.DISCOVERY_QUERIES ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  const queries = [...DEFAULT_QUERIES, ...extra];
  const allowedRaw = (process.env.DISCOVERY_ALLOWED_DOMAINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowed = allowedRaw.length ? allowedRaw : DEFAULT_ALLOWED_DOMAINS;
  const model = process.env.DISCOVERY_MODEL?.trim() || getAnthropicModel();
  const known = new Set(data.adListings.map((a) => a.url).filter(Boolean));

  live.discovery("Scanning Kijiji / Craigslist / Facebook for job requests", `${region} · up to ${maxSearches} searches · ${model}`);

  const tool: Record<string, unknown> = {
    type: "web_search_20260209",
    name: "web_search",
    max_uses: maxSearches,
    user_location: { type: "approximate", city: "Halifax", region: "Nova Scotia", country: "CA", timezone: "America/Halifax" },
    allowed_domains: allowed,
  };

  const system = `You find people who are ASKING for exterior contracting work (siding, soffit/fascia, decks, windows & doors, exterior trim, building envelope) in ${region}, posted in the last 14 days on classifieds, community boards, forums, Facebook groups, Reddit, Nextdoor, HomeStars-style request boards, or local news/social posts. Ignore contractors advertising services, job postings for employees, and anything outside the region. Search several of these angles: ${queries.join("; ")}. Then respond with ONLY a JSON array (no prose) of up to 15 objects: {"title": string, "url": "https://… REQUIRED live listing URL", "snippet": "what they want, in one or two sentences", "location": "town", "postedAt": "ISO date or empty", "contactEmail": "only if visible on the page — otherwise empty", "contactPhone": "only if visible — otherwise empty", "confidence": 0-100}. NEVER invent emails, phones, or URLs. Skip Google/Bing search-result pages and "Today's search results" titles. Skip URLs you have seen before: ${[...known].slice(-40).join(", ") || "none"}.`;

  const errors: string[] = [];
  let text = "";
  try {
    const res = await fetcher("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        system,
        tools: [tool],
        messages: [{ role: "user", content: `Find new job requests in ${region} now. Return only the JSON array.` }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Anthropic ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }>; usage?: Record<string, unknown> };
    text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    const searches = (json.usage as { server_tool_use?: { web_search_requests?: number } } | undefined)?.server_tool_use?.web_search_requests;
    live.ai(`Discovery run (${model})`, `${searches ?? "?"} web search(es)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    live.error("discovery", "Lead discovery failed", msg);
    return { summary: `Lead discovery: failed — ${msg}`, created: 0, qualified: 0, errors };
  }

  const candidates = extractJsonArray(text)
    .filter((c) => (c.confidence ?? 50) >= 40)
    .filter((c) => isRealHttpUrl(c.url))
    .filter((c) => !isJunkAdTitle(c.title))
    .map((c) => ({
      ...c,
      // Never trust model-invented contacts unless they look like real emails;
      // prefer empty and let the listing page / alert supply contact later.
      contactEmail: isRealContactEmail(c.contactEmail) ? c.contactEmail!.trim() : "",
      contactPhone: c.contactPhone?.trim() || "",
    }));
  const rejected = extractJsonArray(text).length - candidates.length;
  if (rejected > 0) {
    live.discovery(
      `Dropped ${rejected} discovery candidate(s) without a real https URL or with junk titles`,
      undefined,
      "warn",
    );
  }
  const source: AdSource = ensureBuiltinSource(data, "webhook", ctx);
  let discoverySource = data.adSources.find((s) => s.id === "adsrc-discovery");
  if (!discoverySource) {
    discoverySource = { ...source, id: "adsrc-discovery", name: "Web discovery (Claude)", type: "manual", url: "", enabled: true, keywords: [], excludeKeywords: [], lastPolledAt: null, lastError: null, createdAt: ctx.nowIso() };
    data.adSources.push(discoverySource);
  }
  const raws: RawAd[] = candidates.map((c) => ({
    title: c.title.slice(0, 200),
    body: c.snippet ?? "",
    url: c.url,
    location: c.location,
    postedAt: c.postedAt || ctx.nowIso(),
    contactEmail: c.contactEmail,
    contactPhone: c.contactPhone,
  }));
  const created = ingestRawAds(data, discoverySource, raws, ctx);
  discoverySource.lastPolledAt = ctx.nowIso();
  discoverySource.lastError = null;
  let qualified = 0;
  for (const ad of created) {
    try {
      const r = await qualifyListing(data, ad, { ...ctx });
      if (r.qualified) qualified += 1;
      live.ad(`${r.qualified ? "Qualified" : "Skipped"}: ${ad.title.slice(0, 80)}`, `${ad.sourceName} · score ${ad.score}${ad.location ? ` · ${ad.location}` : ""}`, { adId: ad.id, leadId: ad.leadId ?? undefined }, r.qualified ? "success" : "info");
    } catch (err) {
      errors.push(`${ad.title.slice(0, 40)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const summary = `Lead discovery: ${candidates.length} candidate(s) found, ${created.length} new, ${qualified} qualified.`;
  live.discovery(summary, undefined, created.length ? "success" : "info");
  return { summary, created: created.length, qualified, errors };
}
