import { describe, expect, it } from "vitest";
import {
  CRA_RATE_PER_KM,
  UNIACKE_SITE_TRAVEL,
  travelCost,
} from "../src/lib/fuel-travel";

describe("fuel travel helpers", () => {
  it("prices the Regency ↔ Mount Uniacke round trip at the CRA rate", () => {
    expect(UNIACKE_SITE_TRAVEL.fromAddress).toMatch(/Regency Drive/i);
    expect(UNIACKE_SITE_TRAVEL.toAddress).toMatch(/Mount Uniacke/i);
    expect(UNIACKE_SITE_TRAVEL.distanceKm).toBeCloseTo(69.8, 1);
    expect(travelCost(UNIACKE_SITE_TRAVEL.distanceKm)).toBe(
      Math.round(69.8 * CRA_RATE_PER_KM * 100) / 100,
    );
    expect(travelCost(UNIACKE_SITE_TRAVEL.distanceKm)).toBe(50.26);
  });
});
