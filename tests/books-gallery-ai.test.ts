import { describe, expect, it } from "vitest";
import { buildSeedData } from "../src/lib/seed";
import { buildLocalPnl } from "../src/lib/quickbooks";
import { filterShowcaseByAudience } from "../src/lib/site/audience";
import { JOB_SHOWCASE_IMAGES } from "../src/lib/site/jobShowcaseImages";
import { ADMIN_NAV, LEGACY_REDIRECTS } from "../src/lib/nav";
import { browserAiStatus, hasClientAiKey } from "../src/lib/ai-client";

describe("books pnl", () => {
  it("builds a two-year local P&L from seed data", () => {
    const report = buildLocalPnl(buildSeedData(), 2);
    expect(report.source).toBe("local");
    expect(report.periods).toHaveLength(2);
    expect(report.totals.revenue).toBeGreaterThanOrEqual(0);
  });
});

describe("residential gallery", () => {
  it("does not include the removed dog showcase asset", () => {
    const residential = filterShowcaseByAudience(JOB_SHOWCASE_IMAGES, "residential");
    expect(residential.length).toBeGreaterThan(0);
    expect(residential[0]?.title.toLowerCase()).not.toContain("dog");
  });
});

describe("knocker consolidation", () => {
  it("removes standalone Territories nav and redirects zones", () => {
    expect(ADMIN_NAV.some((n) => n.href === "/admin/zones")).toBe(false);
    expect(ADMIN_NAV.some((n) => n.href === "/admin/knocker")).toBe(true);
    expect(LEGACY_REDIRECTS["/admin/zones"]).toBe("/admin/knocker?tab=zones");
  });

  it("registers Books & P&L in overview nav", () => {
    expect(ADMIN_NAV.some((n) => n.href === "/admin/books")).toBe(true);
  });
});

describe("browser ai status", () => {
  it("returns unconfigured status without a key in node", () => {
    expect(hasClientAiKey()).toBe(false);
    const status = browserAiStatus(null);
    expect(status.configured).toBe(false);
  });
});
