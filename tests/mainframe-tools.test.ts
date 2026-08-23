import { describe, expect, it } from "vitest";
import { buildSeedData } from "@/lib/seed";
import { executeMainframeTool } from "@/lib/mainframe-tools";

const ctx = {
  authorId: "emp-admin",
  newId: () => `test-${Math.random().toString(16).slice(2)}`,
  nowIso: () => new Date().toISOString(),
};

describe("mainframe tools", () => {
  it("creates a lead and returns summary", () => {
    const data = buildSeedData();
    const before = data.leads.length;
    const result = executeMainframeTool(
      data,
      "create_lead",
      { name: "Test Mainframe Lead", city: "Denver", jobType: "residential" },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(data.leads.length).toBe(before + 1);
  });

  it("runs daily automations when forced", () => {
    const data = buildSeedData();
    const result = executeMainframeTool(
      data,
      "run_daily_automations",
      { force: true },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.summary.length).toBeGreaterThan(10);
  });

  it("hunts leads and queues outreach", () => {
    const data = buildSeedData();
    const result = executeMainframeTool(data, "hunt_leads", {}, ctx);
    expect(result.ok).toBe(true);
  });
});
