import { describe, expect, it } from "vitest";
import { buildMarketPulse } from "@/lib/market-intel";
import { buildSeedData } from "@/lib/seed";

describe("market intel", () => {
  it("builds a market pulse with tickers and competitors", async () => {
    const data = buildSeedData();
    const pulse = await buildMarketPulse(data);
    expect(pulse.tickers.length).toBeGreaterThan(5);
    expect(pulse.competitors.length).toBeGreaterThan(3);
    expect(pulse.headlines.length).toBeGreaterThan(2);
    expect(pulse.signals.length).toBeGreaterThan(0);
    expect(["live", "synthetic", "mixed"]).toContain(pulse.source);
  });
});
