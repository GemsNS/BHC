import { describe, expect, it } from "vitest";
import {
  KIJIJI_DEMAND_QUERIES,
  KIJIJI_DEMAND_SOURCES,
  buildKijijiServicesUrl,
  isKijijiDemandAd,
  normalizeKijijiListings,
} from "../src/lib/kijiji-realtime";
import {
  adMatchesSource,
  ensurePublicAdSources,
  ingestRawAds,
  parseKijijiSearchHtml,
  type RawAd,
} from "../src/lib/ad-ingest";
import { looksLikeDemand } from "../src/lib/lead-search-recipes";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { normalizeStore } from "../src/lib/normalize";
import type { AppData } from "../src/lib/types";

let n = 0;
const ctx = { newId: () => `kj-${++n}`, nowIso: () => "2026-09-11T02:00:00.000Z" };

function store(): AppData {
  const d = normalizeStore(buildDemoSeedData());
  d.adSources = [];
  d.adListings = [];
  d.outreachQueue = [];
  return d;
}

/** A Kijiji Services search page with one demand ask and one contractor supply ad. */
const FIXTURE = `<!DOCTYPE html><html><head><title>services</title></head><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      __APOLLO_STATE__: {
        "StandardListing:2001": {
          __typename: "StandardListing",
          id: "2001",
          title: "Looking for someone to replace vinyl siding",
          description: "Need a quote to re-side our bungalow in Dartmouth. Please reach out.",
          url: "https://www.kijiji.ca/v-skilled-trades/city-of-halifax/need-siding/2001",
          sortingDate: "2026-09-11T01:00:00.000Z",
          location: { name: "Dartmouth" },
        },
        "StandardListing:2002": {
          __typename: "StandardListing",
          id: "2002",
          title: "Pro siding & soffit — free estimates",
          description: "We install siding and soffit across HRM. Licensed and insured. Call us today!",
          url: "https://www.kijiji.ca/v-skilled-trades/city-of-halifax/pro-siding/2002",
          sortingDate: "2026-09-11T01:05:00.000Z",
          location: { name: "Halifax" },
        },
      },
    },
  },
})}</script></body></html>`;

describe("kijiji-realtime demand detection", () => {
  it("keeps homeowner asks, drops contractor supply and real-estate", () => {
    expect(looksLikeDemand("Looking for someone to replace our siding — need a quote.")).toBe(true);
    expect(looksLikeDemand("We install siding, free estimates, licensed and insured. Call us today!")).toBe(false);
    expect(looksLikeDemand("Charming 3 bedroom 2 bathroom home for sale, new deck, open house Sunday.")).toBe(false);
    expect(looksLikeDemand("Vinyl siding panels for sale, $200 obo.")).toBe(false);
    // trade term alone, no ask -> not demand
    expect(looksLikeDemand("New vinyl siding installed on this property.")).toBe(false);
  });

  it("isKijijiDemandAd reads title + body", () => {
    expect(isKijijiDemandAd({ title: "Contractor wanted", body: "for a deck rebuild" })).toBe(true);
    expect(isKijijiDemandAd({ title: "We build decks", body: "free estimates" })).toBe(false);
  });
});

describe("kijiji-realtime source defs", () => {
  it("builds newest-first HRM Services search URLs", () => {
    const url = buildKijijiServicesUrl("looking for siding");
    expect(url).toContain("kijiji.ca/b-services/city-of-halifax/");
    expect(url).toContain("k0c72l1700321");
    expect(url).toContain("sort=dateDesc");
    expect(url).toContain("keywords=looking%20for%20siding");
  });

  it("ships demand sources that are html + intent-keyed", () => {
    expect(KIJIJI_DEMAND_SOURCES.length).toBeGreaterThan(0);
    expect(KIJIJI_DEMAND_QUERIES.length).toBeGreaterThan(0);
    for (const s of KIJIJI_DEMAND_SOURCES) {
      expect(s.type).toBe("html");
      expect(s.id.startsWith("adsrc-kijiji-demand-")).toBe(true);
      expect(s.keywords.length).toBeGreaterThan(0); // intent keep-list
      expect(s.excludeKeywords).toContain("we install");
    }
  });

  it("ensurePublicAdSources wires the demand sources", () => {
    const d = store();
    ensurePublicAdSources(d, ctx);
    for (const s of KIJIJI_DEMAND_SOURCES) {
      expect(d.adSources.find((x) => x.id === s.id)).toBeTruthy();
    }
  });
});

describe("kijiji-realtime parse + filter integration", () => {
  it("parses __NEXT_DATA__ and keeps only the demand listing under a demand source", () => {
    const raws = parseKijijiSearchHtml(FIXTURE);
    expect(raws.length).toBe(2);
    const kept = normalizeKijijiListings(raws);
    expect(kept.map((r) => r.externalId)).toEqual(["kijiji:2001"]);

    // The same demand source's keep/exclude lists also drop the supply ad at ingest.
    const d = store();
    ensurePublicAdSources(d, ctx);
    const source = d.adSources.find((s) => s.id === "adsrc-kijiji-demand-siding")!;
    expect(source).toBeTruthy();
    const demand = raws.find((r) => r.externalId === "kijiji:2001")!;
    const supply = raws.find((r) => r.externalId === "kijiji:2002")!;
    expect(adMatchesSource(source, demand)).toBe(true);
    expect(adMatchesSource(source, supply)).toBe(false);

    const created = ingestRawAds(d, source, raws, ctx);
    expect(created.map((a) => a.externalId)).toEqual(["kijiji:2001"]);
  });

  it("normalizeKijijiListings dedupes by id", () => {
    const dup: RawAd[] = [
      { externalId: "kijiji:9", title: "Looking for a contractor for deck repair", body: "need a quote" },
      { externalId: "kijiji:9", title: "Looking for a contractor for deck repair", body: "need a quote" },
    ];
    expect(normalizeKijijiListings(dup).length).toBe(1);
  });
});
