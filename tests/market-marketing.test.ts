import { describe, expect, it } from "vitest";
import { buildMarketingIntel } from "@/lib/market-marketing";

describe("buildMarketingIntel", () => {
  it("returns equipment, marketplace, ads, and tools", () => {
    const intel = buildMarketingIntel(1_700_000_000_000);
    expect(intel.equipment.length).toBeGreaterThan(0);
    expect(intel.marketplace.length).toBeGreaterThan(0);
    expect(intel.adDrafts.length).toBeGreaterThan(0);
    expect(intel.tools.some((t) => t.href === "/admin/assistant")).toBe(true);
    expect(intel.assistantSummary).toContain("Auto-ad assistant");
  });

  it("assigns rent/buy verdicts from utilization", () => {
    const intel = buildMarketingIntel();
    for (const e of intel.equipment) {
      expect(["rent", "buy", "either"]).toContain(e.verdict);
      expect(e.breakEvenDays).toBeGreaterThan(0);
    }
  });
});
