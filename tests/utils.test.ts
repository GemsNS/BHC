import { describe, expect, it } from "vitest";
import { formatCurrency, formatHours, labelize } from "../src/lib/utils";
import { buildSeedData } from "../src/lib/seed";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { ROLE_PERMISSIONS, homeForRole } from "../src/lib/types";
import {
  buildActivityFeed,
  buildOpsAlerts,
  buildOpsMetrics,
} from "../src/lib/ops-wall";

describe("utils", () => {
  it("formats currency", () => {
    expect(formatCurrency(28500)).toBe("$28,500");
  });

  it("formats hours from ms", () => {
    expect(formatHours(90 * 60 * 1000)).toBe("1.5h");
  });

  it("labelizes snake case", () => {
    expect(labelize("in_progress")).toBe("In Progress");
  });
});

describe("production seed data", () => {
  it("includes HRM production starter collections", () => {
    const seed = buildSeedData();
    expect(seed.employees.length).toBe(7);
    expect(seed.leads.length).toBe(0);
    expect(seed.jobs.length).toBe(0);
    expect(seed.zones.length).toBeGreaterThan(0);
    expect(seed.assistantMemory.length).toBeGreaterThan(0);
    expect(seed.assistantProfiles[0]?.regions).toContain("Halifax");
  });

  it("gives every employee a login and default bootstrap PIN", () => {
    const seed = buildSeedData();
    for (const emp of seed.employees) {
      expect(emp.login.length).toBeGreaterThan(0);
      expect(emp.pin).toBe("0000");
      expect(emp.mustChangePassword).toBe(true);
    }
  });
});

describe("demo seed data", () => {
  it("includes rich demo CRM collections", () => {
    const seed = buildDemoSeedData();
    expect(seed.leads.length).toBeGreaterThan(0);
    expect(seed.jobs.length).toBeGreaterThan(0);
    expect(seed.knocks.length).toBeGreaterThan(0);
  });
});

describe("ops wall helpers", () => {
  it("builds metrics and activity feed from demo seed", () => {
    const seed = buildDemoSeedData();
    const metrics = buildOpsMetrics(seed);
    expect(metrics.length).toBe(5);
    expect(buildActivityFeed(seed).length).toBeGreaterThan(0);
    expect(Array.isArray(buildOpsAlerts(seed))).toBe(true);
  });
});

describe("role permissions", () => {
  it("gates knocker away from admin dashboard", () => {
    expect(ROLE_PERMISSIONS.knocker.includes("dashboard")).toBe(false);
    expect(ROLE_PERMISSIONS.knocker.includes("knocker")).toBe(true);
    expect(ROLE_PERMISSIONS.knocker.includes("board")).toBe(true);
  });

  it("routes roles to the right home", () => {
    expect(homeForRole("admin")).toBe("/admin/dashboard");
    expect(homeForRole("knocker")).toBe("/apps");
    expect(homeForRole("driver")).toBe("/apps");
  });
});
