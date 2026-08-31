import { describe, expect, it } from "vitest";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { onLeadCreated, onLeadStatusChanged } from "../src/lib/workflows";
import { scoreLead, findProspectsForLead } from "../src/lib/lead-automation";
import type { Lead } from "../src/lib/types";

describe("lead automation", () => {
  it("scores leads with contact info higher", () => {
    const lead: Lead = {
      ...buildDemoSeedData().leads[0],
      source: "Referral",
      jobType: "commercial",
      email: "a@b.com",
      phone: "555",
    };
    expect(scoreLead(lead)).toBeGreaterThan(70);
  });

  it("finds prospects for qualified commercial leads", () => {
    const data = buildDemoSeedData();
    const lead = data.leads.find((l) => l.id === "lead-2")!;
    const prospects = findProspectsForLead(data, lead, 2);
    expect(prospects.length).toBeGreaterThan(0);
    expect(prospects[0].prospectEmail).toContain("@");
  });
});

describe("workflows", () => {
  it("runs lead_created workflow and enrolls sequence", () => {
    const data = buildDemoSeedData();
    const stamp = new Date().toISOString();
    const lead: Lead = {
      id: "lead-test",
      name: "Test Lead",
      phone: "555",
      email: "test@test.com",
      address: "1 Test St",
      city: "Seaside",
      source: "Website",
      status: "new",
      jobType: "residential",
      notes: "",
      assignedToId: null,
      companyId: null,
      leadScore: 50,
      createdAt: stamp,
      updatedAt: stamp,
    };
    data.leads.unshift(lead);
    const before = data.sequenceEnrollments.length;
    const runs = onLeadCreated(data, lead);
    expect(runs.length).toBeGreaterThan(0);
    expect(data.sequenceEnrollments.length).toBeGreaterThan(before);
    expect(lead.assignedToId).toBe("emp-sales-1");
  });

  it("queues outreach when lead becomes qualified", () => {
    const data = buildDemoSeedData();
    const lead = data.leads.find((l) => l.id === "lead-3")!;
    lead.status = "qualified";
    const before = data.outreachQueue.length;
    onLeadStatusChanged(data, lead);
    expect(data.outreachQueue.length).toBeGreaterThan(before);
  });
});
