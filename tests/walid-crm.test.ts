import { describe, expect, it } from "vitest";
import { buildSeedData } from "../src/lib/seed";
import { ensureWalidInCrm, WALID_CRM } from "../src/lib/walid-crm";

describe("walid CRM", () => {
  it("seeds the Uniacke warehouse job into production data", () => {
    const data = buildSeedData();
    const job = data.jobs.find((j) => j.id === WALID_CRM.jobId);
    const lead = data.leads.find((l) => l.id === WALID_CRM.leadId);
    const company = data.companies.find((c) => c.id === WALID_CRM.companyId);
    expect(company?.name).toBe("SOI Trade Inc.");
    expect(lead?.status).toBe("won");
    expect(lead?.companyId).toBe(WALID_CRM.companyId);
    expect(job?.contractValue).toBe(14005.12);
    expect(job?.address).toContain("Alicia Scott");
    expect(job?.jobType).toBe("commercial");
    expect(job?.status).toBe("scheduled");
    expect(data.contracts.some((c) => c.slug === "walid")).toBe(true);
    expect(data.deals.some((d) => d.id === WALID_CRM.dealId && d.stage === "closed_won")).toBe(true);
  });

  it("is idempotent and preserves in-progress status", () => {
    const data = buildSeedData();
    const job = data.jobs.find((j) => j.id === WALID_CRM.jobId)!;
    job.status = "in_progress";
    job.notes = "Progress: started north elevation.";
    const first = ensureWalidInCrm(data);
    const second = ensureWalidInCrm(data);
    expect(first.created.length).toBe(0);
    expect(second.updated.length).toBeGreaterThan(0);
    expect(data.jobs.filter((j) => j.id === WALID_CRM.jobId)).toHaveLength(1);
    expect(data.jobs.find((j) => j.id === WALID_CRM.jobId)?.status).toBe("in_progress");
  });
});
