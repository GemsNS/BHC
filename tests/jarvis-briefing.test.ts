import { describe, expect, it } from "vitest";
import { buildSeedData } from "../src/lib/seed";
import {
  buildJarvisInsights,
  buildJarvisSnapshot,
  jarvisContextFromPath,
} from "../src/lib/jarvis-briefing";

describe("jarvis-briefing", () => {
  it("maps paths to context buckets", () => {
    expect(jarvisContextFromPath("/admin/sales")).toBe("sales");
    expect(jarvisContextFromPath("/apps/knocker")).toBe("field");
    expect(jarvisContextFromPath("/admin/knocker")).toBe("field");
    expect(jarvisContextFromPath("/admin/dashboard")).toBe("overview");
  });

  it("returns prioritized insights with detail payloads", () => {
    const data = buildSeedData();
    const insights = buildJarvisInsights(data, "overview");
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.length).toBeLessThanOrEqual(8);
    expect(insights[0].priority).toBeGreaterThanOrEqual(insights.at(-1)!.priority);
    const withActions = insights.filter((i) => i.primaryAction?.href || i.href);
    expect(withActions.length).toBeGreaterThan(0);
  });

  it("includes pipeline metric chips on sales context", () => {
    const data = buildSeedData();
    const snapshot = buildJarvisSnapshot(data, "sales");
    expect(snapshot.metrics.some((m) => m.id === "pipeline")).toBe(true);
  });

  it("surfaces knocker tasks on field context", () => {
    const data = buildSeedData();
    const insights = buildJarvisInsights(data, "field");
    const fieldCards = insights.filter((i) => i.category === "field");
    expect(fieldCards.length).toBeGreaterThan(0);
  });

  it("builds overview snapshot used by the HUD deck strip", () => {
    const data = buildSeedData();
    const snapshot = buildJarvisSnapshot(data, "overview");
    expect(snapshot.metrics.length).toBeGreaterThan(0);
    const insights = buildJarvisInsights(data, "overview");
    expect(insights.some((i) => i.primaryAction?.href)).toBe(true);
  });
});
