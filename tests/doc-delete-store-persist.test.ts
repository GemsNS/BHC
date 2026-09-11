import { mkdtemp, readFile, rm, writeFile, mkdir } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { deleteDocument, generateDocument, uploadDocument } from "../src/lib/documents";
import { jobHub } from "../src/lib/job-hub";
import { normalizeStore } from "../src/lib/normalize";
import { createQuote, signQuote } from "../src/lib/quotes";
import { jsonBackend } from "../src/lib/store-backend";
import type { AppData } from "../src/lib/types";

let n = 0;
const ctx = {
  newId: () => `x-${++n}`,
  nowIso: () => "2026-09-11T02:00:00.000Z",
  createdById: "emp-admin",
};

describe("document delete persists through store backend", () => {
  let dir: string;
  let media: string;
  let storePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "bhc-persist-"));
    media = path.join(dir, "media");
    storePath = path.join(dir, "store.json");
    await mkdir(media, { recursive: true });
    process.env.MEDIA_DIR = media;
    // Clear any cached backend
    const g = globalThis as unknown as Record<symbol, unknown>;
    delete g[Symbol.for("bhc.store.backend")];
    delete g[Symbol.for(`bhc.sqlite.db:${path.join(dir, "store.sqlite")}`)];
  });

  afterEach(async () => {
    delete process.env.MEDIA_DIR;
    const g = globalThis as unknown as Record<symbol, unknown>;
    delete g[Symbol.for("bhc.store.backend")];
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips delete through jsonBackend write/read like the API", async () => {
    const backend = jsonBackend(storePath);
    let data = normalizeStore(buildDemoSeedData());
    data.quotes = [];
    data.documents = [];
    data.payments = [];
    data.messages = [];
    const lead = data.leads[0];
    const q = createQuote(
      data,
      {
        leadId: lead.id,
        createdById: "emp-admin",
        title: "Deck",
        lines: [{ description: "Deck", quantity: 1, unitPrice: 4000 }],
      },
      ctx,
    );
    const { job } = signQuote(
      data,
      q,
      {
        signerName: "Pat",
        signatureDataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      },
      ctx,
    );
    job.portalToken = "tok-persist";

    const contract = await generateDocument(data, { kind: "contract", jobId: job.id }, ctx);
    contract.sentAt = ctx.nowIso();
    await backend.writeAll(data);

    // Simulate API delete: read → mutate → write → read (portal/hub)
    const reloaded = normalizeStore((await backend.readAll()) as Partial<AppData>);
    expect(reloaded.documents.some((d) => d.id === contract.id)).toBe(true);
    expect(jobHub(reloaded, job.id)!.checklist.find((c) => c.key === "contract")?.done).toBe(true);

    await deleteDocument(reloaded, contract.id, ctx);
    await backend.writeAll(reloaded);

    const after = normalizeStore((await backend.readAll()) as Partial<AppData>);
    expect(after.documents.some((d) => d.id === contract.id)).toBe(false);
    const hub = jobHub(after, job.id)!;
    expect(hub.checklist.find((c) => c.key === "contract")?.done).toBe(false);
    const portalDocs = after.documents.filter((d) => d.jobId === job.id && d.sentAt);
    expect(portalDocs.find((d) => d.id === contract.id)).toBeUndefined();
  });

  it("upload then delete clears checklist contract mark", async () => {
    const backend = jsonBackend(storePath);
    let data = normalizeStore(buildDemoSeedData());
    data.documents = [];
    const job = data.jobs[0];
    job.portalToken = "tok-up";
    await backend.writeAll(data);

    const d1 = normalizeStore((await backend.readAll()) as Partial<AppData>);
    const doc = await uploadDocument(
      d1,
      {
        jobId: job.id,
        kind: "contract",
        title: "Signed PDF",
        buffer: Buffer.from("%PDF-1.4 test"),
        fileName: "signed.pdf",
        mimeType: "application/pdf",
      },
      ctx,
    );
    doc.sentAt = ctx.nowIso();
    await backend.writeAll(d1);

    expect(jobHub(d1, job.id)!.checklist.find((c) => c.key === "contract")?.done).toBe(true);

    const d2 = normalizeStore((await backend.readAll()) as Partial<AppData>);
    await deleteDocument(d2, doc.id, ctx);
    await backend.writeAll(d2);

    const d3 = normalizeStore((await backend.readAll()) as Partial<AppData>);
    expect(jobHub(d3, job.id)!.checklist.find((c) => c.key === "contract")?.done).toBe(false);
    expect(d3.documents.filter((x) => x.jobId === job.id && x.sentAt)).toEqual([]);
  });
});
