import { describe, expect, it } from "vitest";
import {
  closePolygon,
  normalizeAddressKey,
  pointInPolygon,
  simplifyPath,
} from "@/lib/knocker/geo";

describe("knocker geo", () => {
  it("detects point inside square polygon", () => {
    const square = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 0 },
    ];
    expect(pointInPolygon({ lat: 0.5, lng: 0.5 }, square)).toBe(true);
    expect(pointInPolygon({ lat: 2, lng: 2 }, square)).toBe(false);
  });

  it("closes polygons", () => {
    const closed = closePolygon([
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
      { lat: 3, lng: 3 },
    ]);
    expect(closed[0]).toEqual(closed[closed.length - 1]);
  });

  it("normalizes address keys for double-knock", () => {
    expect(normalizeAddressKey("123 Main St.")).toBe(normalizeAddressKey("123 main st"));
  });

  it("simplifies collinear paths", () => {
    const simplified = simplifyPath([
      { lat: 0, lng: 0 },
      { lat: 0.5, lng: 0.5 },
      { lat: 1, lng: 1 },
    ], 0.01);
    expect(simplified.length).toBeLessThanOrEqual(3);
  });
});
