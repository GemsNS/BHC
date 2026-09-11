import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { buildSeedData } from "../src/lib/seed";
import { ensureWalidInCrm, WALID_CRM } from "../src/lib/walid-crm";
import {
  importWalidCrewHours,
  importWalidDay1Progress,
  importWalidDay2Progress,
} from "../src/lib/walid-progress";

describe("walid CRM", () => {
  it("seeds the Uniacke warehouse job into production data", () => {
    const data = buildSeedData();
    const job = data.jobs.find((j) => j.id === WALID_CRM.jobId);
    const lead = data.leads.find((l) => l.id === WALID_CRM.leadId);
    const company = data.companies.find((c) => c.id === WALID_CRM.companyId);
    expect(company?.name).toBe("SOI Trade Inc.");
    expect(lead?.status).toBe("won");
    expect(lead?.companyId).toBe(WALID_CRM.companyId);
    expect(job?.contractValue).toBe(13000);
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

  it("imports Day 2 house-wrap photos and Day 1+2 crew hours", async () => {
    const media = mkdtempSync(path.join(tmpdir(), "bhc-media-"));
    process.env.MEDIA_DIR = media;
    try {
      const data = buildSeedData();
      const day2Import = await importWalidDay2Progress(data, { authorId: "emp-cameron-field" });
      expect(day2Import.photoUrls).toHaveLength(3);
      expect(day2Import.entryIds).toEqual(["prog-walid-day2"]);
      expect(data.jobProgress.some((p) => p.id === "prog-walid-day2")).toBe(true);
      expect(data.jobs.find((j) => j.id === WALID_CRM.jobId)?.notes).toMatch(/Day 2/);
      expect(data.jobs.find((j) => j.id === WALID_CRM.jobId)?.notes).toMatch(/half/i);

      const hours = importWalidCrewHours(data);
      expect(hours.employeeIds.sort()).toEqual(
        ["emp-cameron-field", "emp-chris", "emp-rylee"].sort(),
      );
      expect(hours.timeEntryIds).toHaveLength(5); // Day1×2 + Day2×3
      expect(hours.hoursPerShift).toBe(8);
      expect(data.employees.filter((e) => hours.employeeIds.includes(e.id))).toHaveLength(3);
      expect(data.employees.find((e) => e.id === "emp-chris")?.name).toBe("Christopher Ryan Scott");
      const jobEntries = data.timeEntries.filter((t) => t.jobId === WALID_CRM.jobId);
      expect(jobEntries).toHaveLength(5);
      const day1Entries = jobEntries.filter((t) => t.id.includes("-day1-"));
      const day2Entries = jobEntries.filter((t) => t.id.includes("-day2-"));
      expect(day1Entries).toHaveLength(2);
      expect(day2Entries).toHaveLength(3);
      expect(
        day1Entries.every((t) => t.clockIn.includes("T08:00") && t.clockOut?.includes("T14:00")),
      ).toBe(true);
      expect(
        day2Entries.every((t) => t.clockIn.includes("T10:30") && t.clockOut?.includes("T18:30")),
      ).toBe(true);
      expect(day1Entries.map((t) => t.employeeId).sort()).toEqual(["emp-cameron-field", "emp-chris"]);
      expect(data.timeEntries.some((t) => t.id === "time-walid-day1-rylee")).toBe(false);
      expect(data.jobs.find((j) => j.id === WALID_CRM.jobId)?.notes).toMatch(
        /Crew hours: Day 1 .*Christopher & Cameron 08:00–14:00/,
      );

      // Idempotent — also clears a stale Day 1 Rylee row if reintroduced
      data.timeEntries.unshift({
        id: "time-walid-day1-rylee",
        employeeId: "emp-rylee",
        clockIn: "2026-09-09T10:30:00.000-03:00",
        clockOut: "2026-09-09T18:30:00.000-03:00",
        jobId: WALID_CRM.jobId,
        notes: "stale",
      });
      importWalidCrewHours(data);
      await importWalidDay2Progress(data);
      expect(data.timeEntries.filter((t) => t.jobId === WALID_CRM.jobId)).toHaveLength(5);
      expect(data.timeEntries.some((t) => t.id === "time-walid-day1-rylee")).toBe(false);
      expect(data.jobProgress.filter((p) => p.id === "prog-walid-day2")).toHaveLength(1);
    } finally {
      delete process.env.MEDIA_DIR;
      rmSync(media, { recursive: true, force: true });
    }
  });

  it("attaches Christopher hours to existing Christopher Ryan Scott (not a stub)", () => {
    const data = buildSeedData();
    data.employees.push({
      id: "emp-crs-live",
      name: "Christopher Ryan Scott",
      email: "christopher.scott@bhcontracting.ca",
      login: "christopher.scott",
      pin: "0000",
      passwordHash: null,
      mustChangePassword: false,
      role: "field",
      phone: "",
      hireDate: "2024-01-01",
      hourlyRate: 28,
      active: true,
    });
    // Simulate the mistaken stub from the earlier import.
    data.employees.push({
      id: "emp-chris",
      name: "Christopher",
      email: "chris@bhcontracting.ca",
      login: "chris",
      pin: "0000",
      passwordHash: null,
      mustChangePassword: true,
      role: "field",
      phone: "",
      hireDate: "2026-09-10",
      hourlyRate: 26,
      active: true,
    });
    data.timeEntries.unshift({
      id: "time-walid-day1-chris",
      employeeId: "emp-chris",
      clockIn: "2026-09-09T08:00:00.000-03:00",
      clockOut: "2026-09-09T14:00:00.000-03:00",
      jobId: WALID_CRM.jobId,
      notes: "stub hours",
    });

    const hours = importWalidCrewHours(data);
    expect(hours.employeeIds).toContain("emp-crs-live");
    expect(hours.employeeIds).not.toContain("emp-chris");
    const chrisEntries = data.timeEntries.filter(
      (t) => t.jobId === WALID_CRM.jobId && t.id.includes("-chris"),
    );
    expect(chrisEntries.length).toBeGreaterThan(0);
    expect(chrisEntries.every((t) => t.employeeId === "emp-crs-live")).toBe(true);
    expect(data.employees.find((e) => e.id === "emp-chris")?.active).toBe(false);
    // Must not bind field Cameron hours onto Cameron Brown / role login cameron.
    expect(hours.employeeIds).toContain("emp-cameron-field");
    expect(data.employees.find((e) => e.id === "emp-cameron-field")?.name).toBe("Cameron");
  });
});
