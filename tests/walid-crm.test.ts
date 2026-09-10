import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { buildSeedData } from "../src/lib/seed";
import { ensureWalidInCrm, WALID_CRM } from "../src/lib/walid-crm";
import { importWalidDay1Progress } from "../src/lib/walid-progress";

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
    expect(job?.notes).toContain("/presentations/walid/v3");
    expect(lead?.notes).toContain("/presentations/walid/v3");
    expect(data.contracts.find((c) => c.slug === "walid")?.notes).toContain(
      "/presentations/walid/v3",
    );
    expect(data.contracts.some((c) => c.slug === "walid")).toBe(true);
    expect(data.deals.some((d) => d.id === WALID_CRM.dealId && d.stage === "closed_won")).toBe(
      true,
    );
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

  it("imports Day 1 field photos onto the job", async () => {
    const media = mkdtempSync(path.join(tmpdir(), "bhc-media-"));
    process.env.MEDIA_DIR = media;
    try {
      const data = buildSeedData();
      const imported = await importWalidDay1Progress(data, { authorId: "emp-field" });
      expect(imported.photoUrls).toHaveLength(9);
      expect(imported.entryIds).toEqual(["prog-walid-day1-a", "prog-walid-day1-b"]);
      expect(data.jobs.find((j) => j.id === WALID_CRM.jobId)?.status).toBe("in_progress");
      const entries = data.jobProgress.filter((p) => p.jobId === WALID_CRM.jobId);
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.imageDataUrls.every((u) => u.startsWith("/api/media/walid-day1-")))).toBe(
        true,
      );
      await importWalidDay1Progress(data);
      expect(data.jobProgress.filter((p) => p.jobId === WALID_CRM.jobId)).toHaveLength(2);
    } finally {
      delete process.env.MEDIA_DIR;
      rmSync(media, { recursive: true, force: true });
    }
  });
});
