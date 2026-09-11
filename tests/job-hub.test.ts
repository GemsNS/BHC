import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { normalizeStore } from "../src/lib/normalize";
import { ensureNumbers, nextNumber, publicToken } from "../src/lib/numbering";
import { createQuote, declineQuote, markQuoteViewed, quoteTotals, signQuote, updateQuote } from "../src/lib/quotes";
import { applyPayment, detectEtransfer, invoiceBalance, matchEtransferToInvoice, verifyStripeSignature } from "../src/lib/payments";
import { jobHub } from "../src/lib/job-hub";
import { generateDocument, renderInvoicePdf, renderQuotePdf } from "../src/lib/documents";
import { createHmac } from "crypto";
import type { AppData } from "../src/lib/types";

let n = 0;
const ctx = { newId: () => `x-${++n}-${Math.random().toString(16).slice(2, 6)}`, nowIso: () => new Date().toISOString() };

function store(): AppData {
  const d = normalizeStore(buildDemoSeedData());
  d.quotes = [];
  d.documents = [];
  d.payments = [];
  d.messages = [];
  return d;
}

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "bhc-hub-"));
  process.env.MEDIA_DIR = tmp;
});
afterEach(async () => {
  delete process.env.MEDIA_DIR;
  await rm(tmp, { recursive: true, force: true });
});

describe("numbering", () => {
  it("issues sequential yearly numbers and backfills", () => {
    const d = store();
    const y = new Date().getFullYear();
    expect(nextNumber(d, "quote")).toBe(`Q-${y}-0001`);
    d.quotes.push({ ...createQuote(d, { createdById: "emp-admin", title: "A" }, ctx) });
    expect(nextNumber(d, "quote")).toBe(`Q-${y}-0002`);
    for (const j of d.jobs) delete j.number;
    const changed = ensureNumbers(d);
    expect(changed).toBeGreaterThan(0);
    expect(new Set(d.jobs.map((j) => j.number)).size).toBe(d.jobs.length);
    expect(publicToken(ctx.newId)).not.toContain("-");
  });
});

describe("quotes", () => {
  it("totals apply discount, HST and deposit", () => {
    const t = quoteTotals({ lines: [{ id: "a", description: "x", quantity: 2, unit: "ea", unitPrice: 100, kind: "other" }], taxRate: 0.15, discount: 20, depositPercent: 30 });
    expect(t.subtotal).toBe(200);
    expect(t.tax).toBe(27);
    expect(t.total).toBe(207);
    expect(t.deposit).toBe(62.1);
    expect(t.balance).toBe(144.9);
  });

  it("signing creates a job, deposit invoice, wins the lead, and is idempotent", () => {
    const d = store();
    const lead = d.leads[0];
    lead.status = "qualified";
    const q = createQuote(d, { leadId: lead.id, createdById: "emp-admin", title: "Siding", lines: [{ description: "Siding", quantity: 1, unitPrice: 10000 }], depositPercent: 25 }, ctx);
    expect(q.status).toBe("draft");
    expect(q.customerName).toBe(lead.name);
    updateQuote(d, q.id, { scope: "Replace siding" }, ctx);
    markQuoteViewed(q, ctx);
    expect(q.status).toBe("draft"); // viewed only flips sent → viewed
    q.status = "sent";
    markQuoteViewed(q, ctx);
    expect(q.status).toBe("viewed");

    const jobsBefore = d.jobs.length;
    const r = signQuote(d, q, { signerName: "Jane Doe", signatureDataUrl: "/api/media/sig-1.png" }, ctx);
    expect(q.status).toBe("signed");
    expect(d.jobs.length).toBe(jobsBefore + 1);
    expect(r.job.quoteId).toBe(q.id);
    expect(r.job.portalToken).toBeTruthy();
    expect(r.job.contractValue).toBe(11500);
    expect(r.depositInvoice?.lines[0].unitPrice).toBe(2875);
    expect(r.depositInvoice?.token).toBeTruthy();
    expect(lead.status).toBe("won");
    const r2 = signQuote(d, q, { signerName: "Jane Doe", signatureDataUrl: "/api/media/sig-1.png" }, ctx);
    expect(d.jobs.length).toBe(jobsBefore + 1);
    expect(r2.depositInvoice?.id).toBe(r.depositInvoice?.id);
    updateQuote(d, q.id, { title: "changed" }, ctx);
    expect(q.title).toBe("Siding"); // locked after signing
    declineQuote(q, "no", ctx);
    expect(q.status).toBe("signed");
  });
});

describe("payments", () => {
  it("applies payments, marks invoices paid, dedupes provider ids", () => {
    const d = store();
    const job = d.jobs[0];
    d.invoices = [{ id: "inv-1", jobId: job.id, kind: "invoice", status: "sent", customerName: job.customerName, lines: [{ id: "l", description: "Deck", quantity: 1, unitPrice: 1000 }], includeProgress: false, progressEntryIds: [], notes: "", aiSummary: null, createdAt: ctx.nowIso(), createdById: "emp-admin" }];
    const inv = d.invoices[0];
    expect(invoiceBalance(d, inv)).toBe(1000);
    const p1 = applyPayment(d, { invoiceId: "inv-1", amount: 400, method: "etransfer" }, ctx);
    expect(p1.paidInFull).toBe(false);
    expect(inv.status).toBe("sent");
    expect(invoiceBalance(d, inv)).toBe(600);
    const p2 = applyPayment(d, { invoiceId: "inv-1", amount: 600, method: "stripe", provider: "stripe", providerId: "pi_1" }, ctx);
    expect(p2.paidInFull).toBe(true);
    expect(inv.status).toBe("paid");
    expect(inv.paidAt).toBeTruthy();
    const dup = applyPayment(d, { invoiceId: "inv-1", amount: 600, method: "stripe", provider: "stripe", providerId: "pi_1" }, ctx);
    expect(dup.duplicate).toBe(true);
    expect(d.payments.length).toBe(2);
  });

  it("verifies Stripe signatures are rejected (Stripe cut) and matches e-Transfer emails", () => {
    const body = '{"id":"evt_1"}';
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
    // Stripe verify always returns false — card pay removed from workflow
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec_test")).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=deadbeef`, "whsec_test")).toBe(false);

    const et = detectEtransfer({ subject: "INTERAC e-Transfer: Jane Doe sent you money", text: "Jane Doe sent you $1,234.56 (CAD).", fromAddress: "notify@payments.interac.ca" });
    expect(et).toEqual({ amount: 1234.56, senderName: "Jane Doe" });
    const d = store();
    d.invoices = [{ id: "i1", jobId: d.jobs[0].id, kind: "invoice", status: "sent", customerName: "Jane Doe", lines: [{ id: "l", description: "x", quantity: 1, unitPrice: 1234.56 }], includeProgress: false, progressEntryIds: [], notes: "", aiSummary: null, createdAt: ctx.nowIso(), createdById: "emp-admin" }];
    expect(matchEtransferToInvoice(d, et!)?.id).toBe("i1");
    expect(detectEtransfer({ subject: "hello", text: "no money here", fromAddress: "a@b.c" })).toBeNull();
  });
});

describe("documents + hub", () => {
  it("renders PDFs, records documents, and the hub assembles the job", async () => {
    const d = store();
    const lead = d.leads[0];
    const q = createQuote(d, { leadId: lead.id, createdById: "emp-admin", title: "Deck rebuild", scope: "Remove and rebuild 12x16 deck.", lines: [{ description: "Deck", quantity: 1, unitPrice: 8000 }] }, ctx);
    const pdf = await renderQuotePdf(d, q);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1500);
    const r = signQuote(d, q, { signerName: "Jane", signatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" }, ctx);
    const doc = await generateDocument(d, { kind: "quote", quoteId: q.id }, { ...ctx, createdById: "emp-admin" });
    expect(doc.fileUrl).toMatch(/^\/api\/media\/quote-.*\.pdf$/);
    expect(d.documents[0].id).toBe(doc.id);
    const contract = await generateDocument(d, { kind: "contract", jobId: r.job.id }, { ...ctx, createdById: "emp-admin" });
    expect(contract.number).toMatch(/^CON-\d{4}-0001$/);
    const invPdf = await renderInvoicePdf(d, r.depositInvoice!);
    expect(invPdf.subarray(0, 4).toString()).toBe("%PDF");
    d.jobProgress.unshift({ id: "p1", jobId: r.job.id, authorId: "emp-admin", notes: "Footings poured", imageDataUrls: [], aiSummary: null, createdAt: ctx.nowIso() });
    const report = await generateDocument(d, { kind: "job_report", jobId: r.job.id }, { ...ctx, createdById: "emp-admin" });
    expect(report.kind).toBe("job_report");

    const hub = jobHub(d, r.job.id)!;
    expect(hub.signedQuote?.id).toBe(q.id);
    expect(hub.invoices.length).toBe(1);
    expect(hub.documents.length).toBe(3);
    expect(hub.money.contractValue).toBe(9200);
    expect(hub.checklist.find((c) => c.key === "quote")?.done).toBe(true);
    expect(hub.checklist.find((c) => c.key === "contract")?.done).toBe(true);
    expect(hub.checklist.find((c) => c.key === "paid")?.done).toBe(false);
    expect(jobHub(d, "nope")).toBeNull();
  });
});
