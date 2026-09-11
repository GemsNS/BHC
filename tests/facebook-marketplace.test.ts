import { describe, expect, it } from "vitest";
import {
  FACEBOOK_DEMAND_QUERIES,
  buildMarketplaceSearchUrl,
  facebookListingToRawAd,
  isFacebookDemandAd,
  marketplaceItemUrl,
  normalizeFacebookListings,
  parseMarketplaceSearchJson,
  type FacebookMarketplaceListing,
} from "../src/lib/facebook-marketplace";
import { ensureBuiltinSource, ingestRawAds, listingIdFromUrl } from "../src/lib/ad-ingest";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { normalizeStore } from "../src/lib/normalize";
import type { AppData } from "../src/lib/types";

let n = 0;
const ctx = { newId: () => `fb-${++n}`, nowIso: () => "2026-09-11T02:00:00.000Z" };

function store(): AppData {
  const d = normalizeStore(buildDemoSeedData());
  d.adSources = [];
  d.adListings = [];
  d.outreachQueue = [];
  return d;
}

describe("facebook-marketplace url + id helpers", () => {
  it("builds item + newest-first search URLs", () => {
    expect(marketplaceItemUrl("12345")).toBe("https://www.facebook.com/marketplace/item/12345");
    const search = buildMarketplaceSearchUrl("looking for siding contractor");
    expect(search).toContain("/marketplace/halifax/search");
    expect(search).toContain("sortBy=creation_time_descend");
    expect(FACEBOOK_DEMAND_QUERIES.length).toBeGreaterThan(0);
  });

  it("normalizes id -> facebook:<id> external id via the shared dedupe", () => {
    const raw = facebookListingToRawAd({ id: "778", title: "Looking for a deck builder, need a quote" });
    expect(raw).toBeTruthy();
    expect(raw!.externalId).toBe("facebook:778");
    expect(listingIdFromUrl(raw!.url ?? "")).toBe("facebook:778");
  });
});

describe("facebook-marketplace demand filter", () => {
  it("keeps homeowner asks, drops supply / for-sale items", () => {
    expect(isFacebookDemandAd({ title: "Looking for siding contractor", body: "need a quote in Halifax" })).toBe(true);
    expect(isFacebookDemandAd({ title: "Vinyl siding for sale", body: "$150 obo" })).toBe(false);
    expect(isFacebookDemandAd({ title: "We install decks — free estimates", body: "call us today" })).toBe(false);
  });

  it("normalizeFacebookListings filters + dedupes by item id", () => {
    const items: FacebookMarketplaceListing[] = [
      { id: "1", title: "Looking for someone to replace soffit and fascia", description: "need a quote" },
      { id: "2", title: "Deck boards for sale", price: "$200" },
      { id: "3", title: "We build decks, free estimates", description: "licensed and insured" },
      { id: "1", title: "Looking for someone to replace soffit and fascia", description: "need a quote" },
    ];
    const out = normalizeFacebookListings(items);
    expect(out.map((r) => r.externalId)).toEqual(["facebook:1"]);
  });

  it("demandOnly:false keeps everything usable", () => {
    const items: FacebookMarketplaceListing[] = [
      { id: "10", title: "Deck boards for sale", price: "$200" },
      { id: "11", title: "Looking for a contractor", description: "need a quote" },
    ];
    expect(normalizeFacebookListings(items, { demandOnly: false }).length).toBe(2);
  });
});

describe("facebook-marketplace embedded JSON extraction", () => {
  it("pulls marketplace_listing_title nodes out of a nested blob", () => {
    const blob = {
      data: {
        marketplace_search: {
          feed_units: {
            edges: [
              {
                node: {
                  listing: {
                    id: "555",
                    marketplace_listing_title: "Looking for a siding contractor in Halifax",
                    listing_price: { formatted_amount: "" },
                    location_text: { text: "Halifax, NS" },
                  },
                },
              },
            ],
          },
        },
      },
    };
    const listings = parseMarketplaceSearchJson(blob);
    expect(listings.length).toBe(1);
    expect(listings[0].id).toBe("555");
    expect(listings[0].title).toContain("siding contractor");
    const raws = normalizeFacebookListings(listings);
    expect(raws[0].externalId).toBe("facebook:555");
  });
});

describe("facebook-marketplace -> CRM ingest", () => {
  it("a demand listing becomes an AdListing keyed facebook:<id>", () => {
    const d = store();
    const src = ensureBuiltinSource(d, "webhook", ctx);
    const raws = normalizeFacebookListings([
      { id: "42", title: "Looking for a contractor to rebuild my deck", description: "need a quote, Bedford" },
    ]);
    const created = ingestRawAds(d, src, raws, ctx);
    expect(created.length).toBe(1);
    expect(created[0].externalId).toBe("facebook:42");
    expect(created[0].url).toContain("/marketplace/item/42");
  });
});
