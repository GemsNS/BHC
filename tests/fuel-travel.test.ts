import { describe, expect, it } from "vitest";
import {
  CRA_RATE_PER_KM,
  UNIACKE_SITE_TRAVEL,
  WALID_JOB_TRAVEL,
  travelCost,
} from "../src/lib/fuel-travel";

describe("fuel travel helpers", () => {
  it("prices the Regency ↔ Mount Uniacke round trip at the CRA rate", () => {
    expect(UNIACKE_SITE_TRAVEL.fromAddress).toMatch(/Regency Drive/i);
    expect(UNIACKE_SITE_TRAVEL.toAddress).toMatch(/Mount Uniacke/i);
    expect(UNIACKE_SITE_TRAVEL.distanceKm).toBeCloseTo(69.8, 1);
    expect(travelCost(UNIACKE_SITE_TRAVEL.distanceKm)).toBe(50.26);
    expect(travelCost(UNIACKE_SITE_TRAVEL.distanceKm)).toBe(
      Math.round(69.8 * CRA_RATE_PER_KM * 100) / 100,
    );
  });

  it("scales Walid job fuel for 3 weeks + 1 week pushback", () => {
    expect(WALID_JOB_TRAVEL.projectedWeeks).toBe(3);
    expect(WALID_JOB_TRAVEL.pushbackWeeks).toBe(1);
    expect(WALID_JOB_TRAVEL.includedRoundTrips).toBe(20);
    expect(WALID_JOB_TRAVEL.totalDistanceKm).toBe(1396.0);
    expect(WALID_JOB_TRAVEL.includedCost).toBe(1005.12);
    expect(travelCost(WALID_JOB_TRAVEL.totalDistanceKm)).toBe(1005.12);
  });
});
