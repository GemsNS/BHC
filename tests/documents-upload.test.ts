import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { buildSeedData } from "../src/lib/seed";
import { deleteDocument, uploadDocument } from "../src/lib/documents";
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
});
