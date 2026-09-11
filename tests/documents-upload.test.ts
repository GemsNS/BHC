import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { buildSeedData } from "../src/lib/seed";
import { deleteDocument, generateDocument, uploadDocument } from "../src/lib/documents";
import { jobHub } from "../src/lib/job-hub";
import { createQuote, signQuote } from "../src/lib/quotes";
import { WALID_CRM } from "../src/lib/walid-crm";

describe("job document upload/delete audit", () => {
  it("uploads a contract PDF onto a job and writes a timeline note", async () => {
    const media = mkdtempSync(path.join(tmpdir(), "bhc-docs-"));
    process.env.MEDIA_DIR = media;
    try {
      const data = buildSeedData();
      const ctx = {
        newId: () => `id-${Math.random().toString(16).slice(2)}`,
        nowIso: () => "2026-09-10T20:00:00.000Z",
        createdById: "emp-admin",
      };
      const pdf = Buffer.from("%PDF-1.4 uploaded contract");
      const doc = await uploadDocument(
        data,
        {
          jobId: WALID_CRM.jobId,
          kind: "contract",
          title: "Signed Walid contract",
          buffer: pdf,
          fileName: "walid-signed.pdf",
          mimeType: "application/pdf",
        },
        ctx,
      );
      expect(doc.kind).toBe("contract");
      expect(doc.jobId).toBe(WALID_CRM.jobId);
      expect(doc.fileUrl).toMatch(/^\/api\/media\//);
      expect(data.documents.some((d) => d.id === doc.id)).toBe(true);
      expect(
        data.activities.some(
          (a) =>
            a.relatedType === "job" &&
            a.relatedId === WALID_CRM.jobId &&
            a.subject.includes("Document uploaded"),
        ),
      ).toBe(true);

      await deleteDocument(data, doc.id, ctx);
      expect(data.documents.some((d) => d.id === doc.id)).toBe(false);
      expect(
        data.activities.some(
          (a) =>
            a.relatedType === "job" &&
            a.relatedId === WALID_CRM.jobId &&
            a.subject.includes("Document deleted"),
        ),
      ).toBe(true);
    } finally {
      delete process.env.MEDIA_DIR;
      rmSync(media, { recursive: true, force: true });
    }
  });

  it("clears quote.pdfUrl when the quote PDF document is deleted", async () => {
    const media = mkdtempSync(path.join(tmpdir(), "bhc-docs-q-"));
    process.env.MEDIA_DIR = media;
    try {
      const data = buildSeedData();
      const ctx = {
        newId: () => `id-${Math.random().toString(16).slice(2)}`,
        nowIso: () => "2026-09-10T21:00:00.000Z",
        createdById: "emp-admin",
      };
      const lead = data.leads[0];
      const q = createQuote(
        data,
        {
          leadId: lead.id,
          createdById: "emp-admin",
          title: "PDF clear",
          lines: [{ description: "Work", quantity: 1, unitPrice: 1000 }],
        },
        ctx,
      );
      const doc = await generateDocument(data, { kind: "quote", quoteId: q.id }, ctx);
      expect(q.pdfUrl).toBe(doc.fileUrl);
      await deleteDocument(data, doc.id, ctx);
      expect(q.pdfUrl).toBeNull();
    } finally {
      delete process.env.MEDIA_DIR;
      rmSync(media, { recursive: true, force: true });
    }
  });
});

describe("deleteDocument → hub checklist + portal docs", () => {
  it("unchecks contract/report and drops portal-visible docs", async () => {
    const media = mkdtempSync(path.join(tmpdir(), "bhc-docs-hub-"));
    process.env.MEDIA_DIR = media;
    try {
      const data = buildSeedData();
      let n = 0;
      const ctx = {
        newId: () => `id-${++n}`,
        nowIso: () => "2026-09-11T03:00:00.000Z",
        createdById: "emp-admin",
      };
      const lead = data.leads[0];
      const q = createQuote(
        data,
        {
          leadId: lead.id,
          createdById: "emp-admin",
          title: "Hub sync",
          lines: [{ description: "Siding", quantity: 1, unitPrice: 5000 }],
        },
        ctx,
      );
      const { job } = signQuote(
        data,
        q,
        {
          signerName: "Alex",
          signatureDataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        },
        ctx,
      );
      job.portalToken = "portal-hub-sync";

      const contract = await generateDocument(data, { kind: "contract", jobId: job.id }, ctx);
      contract.sentAt = ctx.nowIso();
      data.jobProgress.unshift({
        id: "prog-1",
        jobId: job.id,
        authorId: "emp-admin",
        notes: "Day 1",
        imageDataUrls: [],
        aiSummary: null,
        createdAt: ctx.nowIso(),
      });
      const report = await generateDocument(data, { kind: "job_report", jobId: job.id }, ctx);
      report.sentAt = ctx.nowIso();

      expect(jobHub(data, job.id)!.checklist.find((c) => c.key === "contract")?.done).toBe(true);
      expect(jobHub(data, job.id)!.checklist.find((c) => c.key === "report")?.done).toBe(true);
      expect(
        data.documents.filter((d) => d.jobId === job.id && d.sentAt && (d.kind === "contract" || d.kind === "job_report"))
          .length,
      ).toBe(2);

      await deleteDocument(data, contract.id, ctx);
      await deleteDocument(data, report.id, ctx);

      const hub = jobHub(data, job.id)!;
      expect(hub.checklist.find((c) => c.key === "contract")?.done).toBe(false);
      expect(hub.checklist.find((c) => c.key === "report")?.done).toBe(false);
      expect(
        data.documents.filter((d) => d.jobId === job.id && d.sentAt && (d.kind === "contract" || d.kind === "job_report")),
      ).toEqual([]);
    } finally {
      delete process.env.MEDIA_DIR;
      rmSync(media, { recursive: true, force: true });
    }
  });
});
