import { describe, expect, it } from "vitest";
import { adMatchesSource, ensureImapAdSource, newAdSource } from "../src/lib/ad-ingest";
import { classifyAdLocal } from "../src/lib/ad-classify";
import {
  DEFAULT_AD_EXCLUDE_KEYWORDS,
  DEFAULT_AD_KEEP_KEYWORDS,
  DEFAULT_DISCOVERY_QUERIES,
  looksLikeRealEstateNoise,
} from "../src/lib/lead-search-recipes";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { normalizeStore } from "../src/lib/normalize";

describe("lead search recipes", () => {
  it("flags house-for-sale posts that mention a deck", () => {
    expect(
      looksLikeRealEstateNoise(
        "Beautiful 4 bedroom home for sale in Dartmouth with large deck and new windows. MLS 123.",
      ),
    ).toBe(true);
  });

  it("does not flag a homeowner asking for deck work", () => {
    expect(
      looksLikeRealEstateNoise(
        "Looking for someone to rebuild our rear deck in Bedford. Need a quote this month.",
      ),
    ).toBe(false);
  });

  it("uses demand queries instead of bare deck keyword searches", () => {
    expect(DEFAULT_DISCOVERY_QUERIES.some((q) => q.includes("looking for"))).toBe(true);
    expect(DEFAULT_DISCOVERY_QUERIES.every((q) => !/^deck$/i.test(q))).toBe(true);
    expect(DEFAULT_AD_KEEP_KEYWORDS).toContain("looking for");
    expect(DEFAULT_AD_EXCLUDE_KEYWORDS).toContain("for sale");
  });
});

describe("imap source filtering", () => {
  const ctx = { newId: () => "id-1", nowIso: () => "2026-09-10T00:00:00.000Z" };

  it("drops real-estate noise even when the word deck appears", () => {
    const source = newAdSource(
      {
        name: "test",
        type: "imap",
        keywords: [...DEFAULT_AD_KEEP_KEYWORDS],
        excludeKeywords: [...DEFAULT_AD_EXCLUDE_KEYWORDS],
      },
      ctx,
    );
    expect(
      adMatchesSource(source, {
        title: "3 bed house for sale — huge deck",
        body: "Open house this weekend. 4 bedrooms, realtor listing, MLS.",
      }),
    ).toBe(false);
  });

  it("keeps demand-side deck requests", () => {
    const source = newAdSource(
      {
        name: "test",
        type: "imap",
        keywords: [...DEFAULT_AD_KEEP_KEYWORDS],
        excludeKeywords: [...DEFAULT_AD_EXCLUDE_KEYWORDS],
      },
      ctx,
    );
    expect(
      adMatchesSource(source, {
        title: "Looking for someone to repair our deck",
        body: "Need a quote for deck repair in Sackville. Soft boards near stairs.",
      }),
    ).toBe(true);
  });

  it("refreshes keep/drop lists on ensureImapAdSource", () => {
    process.env.ADS_IMAP_ENABLED = "1";
    process.env.SMTP_USER = "alerts@example.com";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_HOST = "smtp.office365.com";
    const data = normalizeStore(buildDemoSeedData());
    data.adSources = [
      {
        id: "adsrc-imap",
        name: "old",
        type: "imap",
        url: "",
        enabled: false,
        keywords: ["deck"],
        excludeKeywords: [],
        region: "HRM",
        lastPolledAt: null,
        lastError: "Login is disabled",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const src = ensureImapAdSource(data, ctx);
    expect(src?.enabled).toBe(true);
    expect(src?.keywords).toEqual([...DEFAULT_AD_KEEP_KEYWORDS]);
    expect(src?.excludeKeywords).toEqual([...DEFAULT_AD_EXCLUDE_KEYWORDS]);
  });
});

describe("classifier real-estate penalty", () => {
  it("scores house listings below the job threshold", () => {
    const result = classifyAdLocal({
      title: "Family home for sale with brand new deck",
      body: "4 bedrooms, 2 bathrooms, MLS listed, open house Sunday. Large deck and vinyl siding.",
      location: "Dartmouth",
      contactEmail: "",
      contactPhone: "",
      contactName: "",
    });
    expect(result.isJobRequest).toBe(false);
    expect(result.score).toBeLessThan(55);
    expect(result.reasons.some((r) => /real-estate|for-sale/i.test(r))).toBe(true);
  });
});
