import { describe, expect, it } from "vitest";
import { formatCurrency, formatHours, labelize } from "../src/lib/utils";
import { buildSeedData } from "../src/lib/seed";

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
  });
});
