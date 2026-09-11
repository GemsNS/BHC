import { describe, expect, it } from "vitest";
import { normalizeStore } from "../src/lib/normalize";
import { buildSeedData } from "../src/lib/seed";

describe("normalizeStore zones for stats", () => {
  it("fills assignedKnockerIds and targetDoors on legacy zones", () => {
    const data = normalizeStore({
      zones: [
        {
          id: "z-legacy",
          name: "Legacy Zone",
          neighborhood: "",
          city: "Halifax",
          description: "",
          status: "active",
          centerLat: 44.65,
          centerLng: -63.57,
          createdAt: new Date().toISOString(),
        } as never,
      ],
    });
    const zone = data.zones[0];
    expect(zone.assignedKnockerIds).toEqual([]);
    expect(zone.targetDoors).toBe(0);
    // Stats API / page used to crash on .length of undefined
    expect(zone.assignedKnockerIds.length).toBe(0);
  });

  it("preserves seed zone assignment fields", () => {
    const data = normalizeStore(buildSeedData());
    expect(data.zones.length).toBeGreaterThan(0);
    for (const z of data.zones) {
      expect(Array.isArray(z.assignedKnockerIds)).toBe(true);
      expect(typeof z.targetDoors).toBe("number");
    }
  });
});
