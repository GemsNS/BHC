import { afterEach, describe, expect, it } from "vitest";
import {
  ensureAdIntakeSources,
  ensurePublicAdSources,
  ingestRawAds,
  listingIdFromUrl,
  parseFetchedAdDocument,
  parseKijijiSearchHtml,
} from "../src/lib/ad-ingest";
import { runAdIngest } from "../src/lib/ad-pipeline";
import { DEFAULT_PUBLIC_AD_SOURCES } from "../src/lib/lead-search-recipes";
import { KIJIJI_DEMAND_SOURCES } from "../src/lib/kijiji-realtime";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { normalizeStore } from "../src/lib/normalize";
import type { AppData } from "../src/lib/types";

let n = 0;
const ctx = { newId: () => `pub-${++n}`, nowIso: () => "2026-09-11T01:00:00.000Z" };

function store(): AppData {
  const d = normalizeStore(buildDemoSeedData());
  d.adSources = [];
  d.adListings = [];
  d.outreachQueue = [];
  return d;
}

const KIJJI_FIXTURE = `<!DOCTYPE html><html><head><title>siding</title></head><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      __APOLLO_STATE__: {
        "StandardListing:1712345678": {
          __typename: "StandardListing",
          id: "1712345678",
          title: "Looking for someone to replace vinyl siding",
          description: "Need a quote on our bungalow in Dartmouth. Call 902-555-0142.",
          url: "https://www.kijiji.ca/v-skilled-trades/city-of-halifax/need-siding-replaced/1712345678",
          sortingDate: "2026-09-10T12:00:00.000Z",
          location: { name: "City of Halifax" },
        },
        "StandardListing:1712345999": {
          __typename: "StandardListing",
          id: "1712345999",
          title: "Deck stairs repair wanted",
          description: "Looking for a carpenter in Bedford.",
          url: "https://www.kijiji.ca/v-skilled-trades/bedford/deck-stairs-repair/1712345999",
          activationDate: "2026-09-09T08:00:00.000Z",
          location: { name: "Bedford" },
        },
      },
    },
  },
})}</script>
</body></html>`;

const REDDIT_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>How much to replace gutters in HRM</title>
    <link href="https://www.reddit.com/r/halifax/comments/abc123/how_much_to_replace_gutters_in_hrm/"/>
    <id>t3_abc123</id>
    <updated>2026-09-10T15:00:00Z</updated>
    <content type="html"><![CDATA[<p>Looking for quotes on eavestrough replacement in Dartmouth.</p>]]></content>
  </entry>
  <entry>
    <title>Best sushi downtown?</title>
    <link href="https://www.reddit.com/r/halifax/comments/xyz999/best_sushi_downtown/"/>
    <id>t3_xyz999</id>
    <updated>2026-09-10T14:00:00Z</updated>
    <content type="html"><![CDATA[<p>Any recommendations?</p>]]></content>
  </entry>
</feed>`;

afterEach(() => {
  delete process.env.ADS_PUBLIC_SOURCES;
});

describe("public ad source fixtures", () => {
  it("parses Kijiji __NEXT_DATA__ StandardListing cards into raw ads", () => {
    const ads = parseKijijiSearchHtml(KIJJI_FIXTURE);
    expect(ads.length).toBe(2);
    expect(ads[0].externalId).toBe("kijiji:1712345678");
    expect(ads[0].title).toContain("vinyl siding");
    expect(ads[0].contactPhone).toBe("902-555-0142");
    expect(ads[0].location).toBe("City of Halifax");
    expect(listingIdFromUrl(ads[1].url!)).toBe("kijiji:1712345999");
  });

  it("parseFetchedAdDocument routes HTML vs Atom correctly", () => {
    expect(parseFetchedAdDocument(KIJJI_FIXTURE, "https://www.kijiji.ca/b-services/x").length).toBe(2);
    const reddit = parseFetchedAdDocument(REDDIT_ATOM, "https://www.reddit.com/r/halifax/search.rss");
    expect(reddit.length).toBe(2);
    expect(listingIdFromUrl(reddit[0].url!)).toBe("reddit:abc123");
  });

  it("ensurePublicAdSources creates the default Reddit/Kijiji/Craigslist set", () => {
    const d = store();
    const created = ensurePublicAdSources(d, ctx);
    // Trade defaults + intent-first Kijiji demand sources from kijiji-realtime.
    expect(created.length).toBe(DEFAULT_PUBLIC_AD_SOURCES.length + KIJIJI_DEMAND_SOURCES.length);
    expect(d.adSources.some((s) => s.id === "adsrc-reddit-halifax-demand")).toBe(true);
    expect(d.adSources.some((s) => s.id === "adsrc-kijiji-demand-siding")).toBe(true);
    expect(d.adSources.some((s) => s.type === "html")).toBe(true);
    // idempotent
    ensurePublicAdSources(d, ctx);
    expect(d.adSources.filter((s) => s.id.startsWith("adsrc-reddit")).length).toBe(2);
    expect(d.adSources.filter((s) => s.id.startsWith("adsrc-kijiji-demand")).length).toBe(
      KIJIJI_DEMAND_SOURCES.length,
    );
  });

  it("ensureAdIntakeSources can be disabled via ADS_PUBLIC_SOURCES=0", () => {
    process.env.ADS_PUBLIC_SOURCES = "0";
    const d = store();
    const r = ensureAdIntakeSources(d, ctx);
    expect(r.public).toHaveLength(0);
    expect(d.adSources).toHaveLength(0);
  });

  it("runAdIngest discovers non-zero ads from mocked public sources", async () => {
    const d = store();
    ensurePublicAdSources(d, ctx);
    // Keep only sources we can mock cleanly
    for (const s of d.adSources) {
      s.enabled = s.id === "adsrc-reddit-halifax-demand" || s.id === "adsrc-kijiji-html-siding";
    }

    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("reddit.com")) {
        return new Response(REDDIT_ATOM, { status: 200, headers: { "Content-Type": "application/atom+xml" } });
      }
      if (url.includes("kijiji.ca")) {
        return new Response(KIJJI_FIXTURE, { status: 200, headers: { "Content-Type": "text/html" } });
      }
      return new Response("blocked", { status: 403 });
    };

    const result = await runAdIngest(d, {
      ...ctx,
      fetcher,
      ai: false,
      classifyLimit: 50,
    });

    expect(result.fetched).toBeGreaterThan(0);
    expect(result.created).toBeGreaterThan(0);
    expect(d.adListings.length).toBeGreaterThan(0);
    // Demand Reddit gutter post should qualify via local heuristics
    const gutter = d.adListings.find((a) => /gutter/i.test(a.title));
    expect(gutter).toBeTruthy();
    expect(["qualified", "drafted", "new", "skipped"]).toContain(gutter!.status);
    // Kijiji demand listing ingested
    expect(d.adListings.some((a) => a.externalId === "kijiji:1712345678")).toBe(true);
  });

  it("ingests Kijiji fixture through an html source with empty keep-list", () => {
    const d = store();
    const [src] = ensurePublicAdSources(d, ctx).filter((s) => s.type === "html");
    src.keywords = [];
    src.excludeKeywords = ["for sale", "mls"];
    const created = ingestRawAds(d, src, parseKijijiSearchHtml(KIJJI_FIXTURE), ctx);
    expect(created.length).toBe(2);
  });
});
