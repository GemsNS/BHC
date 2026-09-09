import { describe, expect, it } from "vitest";
import {
  SNOW_PACKAGES,
  snowPackageQuoteDetails,
} from "../src/lib/site/snowPackages";

describe("snow packages", () => {
  it("exposes four HRM market-aligned tiers", () => {
    expect(SNOW_PACKAGES).toHaveLength(4);
    expect(SNOW_PACKAGES.map((p) => p.id)).toEqual([
      "driveway",
      "home-shield",
      "property-care",
      "commercial",
    ]);
  });

  it("keeps residential seasonal starters inside local comps", () => {
    const driveway = SNOW_PACKAGES.find((p) => p.id === "driveway");
    const home = SNOW_PACKAGES.find((p) => p.id === "home-shield");
    const property = SNOW_PACKAGES.find((p) => p.id === "property-care");
    expect(driveway?.priceLabel).toBe("$999");
    expect(home?.priceLabel).toBe("$1,549");
    expect(property?.priceLabel).toBe("$2,199");
    expect(home?.featured).toBe(true);
  });

  it("builds quote details from the selected package", () => {
    const text = snowPackageQuoteDetails(SNOW_PACKAGES[1]);
    expect(text).toContain("Home Shield");
    expect(text).toContain("$1,549");
    expect(text).toContain("Property address:");
  });
});
