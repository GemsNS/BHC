import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { deleteDocument, generateDocument } from "../src/lib/documents";
import { jobHub } from "../src/lib/job-hub";
import { normalizeStore } from "../src/lib/normalize";
import { createQuote, signQuote } from "../src/lib/quotes";
import type { AppData } from "../src/lib/types";

let n = 0;
const ctx = {
  newId: () => `x-${++n}-${Math.random().toString(16).slice(2, 6)}`,
  nowIso: () => "2026-09-11T01:00:00.000Z",
  createdById: "emp-admin",
};

function store(): AppData {
  const d = normalizeStore(buildDemoSeedData());
  d.quotes = [];
  d.documents = [];
  d.payments = [];
  d.messages = [];
  return d;
}

/** Mirror the public portal GET document filter. */
function portalDocuments(data: AppData, jobId: string) {
  return data.documents.filter(
    (d) => d.jobId === jobId && d.sentAt && (d.kind === "contract" || d.kind === "job_report"),
  );
}

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "bhc-docdel-"));
  process.env.MEDIA_DIR = tmp;
});
afterEach(async () => {
  delete process.env.MEDIA_DIR;
  await rm(tmp, { recursive: true, force: true });
});

describe("document delete → portal + checklist sync", () => {
  it("clears contract/report checklist and portal docs after delete", async () => {
    const d = store();
    const lead = d.leads[0];
    const q = createQuote(
      d,
      {
        leadId: lead.id,
        createdById: "emp-admin",
        title: "Siding",
        lines: [{ description: "Siding", quantity: 1, unitPrice: 8000 }],
      },
      ctx,
    );
    const { job } = signQuote(
      d,
      q,
      {
        signerName: "Jane",
        signatureDataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      },
      ctx,
    );
    job.portalToken = "portal-test-token";

    const contract = await generateDocument(d, { kind: "contract", jobId: job.id }, ctx);
    contract.sentAt = ctx.nowIso();
    contract.sentVia = "email";
    contract.sentTo = "jane@example.com";

    d.jobProgress.unshift({
      id: "p1",
      jobId: job.id,
      authorId: "emp-admin",
      notes: "Started",
      imageDataUrls: [],
      aiSummary: null,
      createdAt: ctx.nowIso(),
    });
    const report = await generateDocument(d, { kind: "job_report", jobId: job.id }, ctx);
    report.sentAt = ctx.nowIso();
    report.sentVia = "email";
    report.sentTo = "jane@example.com";

    const before = jobHub(d, job.id)!;
    expect(before.checklist.find((c) => c.key === "contract")?.done).toBe(true);
    expect(before.checklist.find((c) => c.key === "report")?.done).toBe(true);
    expect(portalDocuments(d, job.id).map((x) => x.kind).sort()).toEqual(["contract", "job_report"]);

    await deleteDocument(d, contract.id, ctx);
    await deleteDocument(d, report.id, ctx);

    const after = jobHub(d, job.id)!;
    expect(after.documents.some((x) => x.id === contract.id || x.id === report.id)).toBe(false);
    expect(after.checklist.find((c) => c.key === "contract")?.done).toBe(false);
    expect(after.checklist.find((c) => c.key === "report")?.done).toBe(false);
    expect(portalDocuments(d, job.id)).toEqual([]);
  });
});
