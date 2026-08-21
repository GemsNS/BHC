import { describe, expect, it } from "vitest";
import { formatCurrency, formatHours, labelize } from "../src/lib/utils";
import { buildSeedData } from "../src/lib/seed";
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

describe("seed data", () => {
  it("includes core CRM collections", () => {
    const seed = buildSeedData();
    expect(seed.employees.length).toBeGreaterThan(0);
    expect(seed.leads.length).toBeGreaterThan(0);
    expect(seed.jobs.length).toBeGreaterThan(0);
    expect(seed.vehicles.length).toBeGreaterThan(0);
    expect(seed.zones.length).toBeGreaterThan(0);
    expect(seed.knocks.length).toBeGreaterThan(0);
    expect(seed.materials.length).toBeGreaterThan(0);
    expect(seed.fuelLogs.length).toBeGreaterThan(0);
    expect(seed.announcements.length).toBeGreaterThan(0);
    expect(seed.tools.length).toBeGreaterThan(0);
    expect(seed.inventory.length).toBeGreaterThan(0);
    expect(seed.jobProgress.length).toBeGreaterThan(0);
    expect(seed.invoices.length).toBeGreaterThan(0);
  });

  it("gives every employee a login and pin", () => {
    const seed = buildSeedData();
    for (const emp of seed.employees) {
      expect(emp.login.length).toBeGreaterThan(0);
      expect(emp.pin.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("ops wall helpers", () => {
  it("builds metrics and activity feed from seed", () => {
    const seed = buildSeedData();
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
