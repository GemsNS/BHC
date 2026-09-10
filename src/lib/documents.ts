import PDFDocument from "pdfkit";
import { live } from "./events";
import { deleteMedia, readMedia, storeBuffer } from "./media-store";
import { nextNumber } from "./numbering";
import { companyForDocuments, quoteTotals } from "./quotes";
import { invoiceTotal, money } from "./customer-touches";
import type { ActivityType, AppData, CrmActivity, DocumentKind, InvoiceDoc, Job, JobDocument, Quote } from "./types";

/**
 * PDF generation (pdfkit, standard Helvetica — no font files needed) for
 * quotes, contracts, invoices, receipts and job reports. Every document is
 * stored under data/media and recorded in `data.documents` so the job hub
 * shows it and delivery can attach it. Server-only.
 */

type Ctx = { newId: () => string; nowIso: () => string };

const BRAND = "#1f4e5f";
const MUTED = "#666666";

function build(draw: (doc: PDFKit.PDFDocument) => Promise<void> | void): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 54, info: { Producer: "BHC CRM" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    Promise.resolve(draw(doc))
      .then(() => doc.end())
      .catch(reject);
  });
}

function header(doc: PDFKit.PDFDocument, title: string, number: string, date: string) {
  const c = companyForDocuments();
  doc.fillColor(BRAND).fontSize(22).font("Helvetica-Bold").text(c.legalName, 54, 54);
  doc.fillColor(MUTED).fontSize(9).font("Helvetica").text(c.addressLine, 54, 80);
  doc.text([c.phone, c.email, c.website].filter(Boolean).join("  ·  "), 54, 92);
  if (c.hstNumber) doc.text(`HST # ${c.hstNumber}`, 54, 104);
  doc.fillColor("#111111").fontSize(20).font("Helvetica-Bold").text(title, 340, 54, { width: 218, align: "right" });
  doc.fillColor(MUTED).fontSize(10).font("Helvetica").text(number, 340, 80, { width: 218, align: "right" });
  doc.text(date, 340, 94, { width: 218, align: "right" });
  doc.moveTo(54, 122).lineTo(558, 122).lineWidth(1).strokeColor(BRAND).stroke();
  doc.moveDown(2);
  doc.y = 136;
}

function twoCol(doc: PDFKit.PDFDocument, left: [string, string[]], right: [string, string[]]) {
  const y = doc.y;
  doc.fillColor(MUTED).fontSize(9).font("Helvetica-Bold").text(left[0].toUpperCase(), 54, y);
  doc.fillColor("#111111").fontSize(10).font("Helvetica");
  let ly = y + 13;
  for (const line of left[1].filter(Boolean)) {
    doc.text(line, 54, ly, { width: 240 });
    ly += 13;
  }
  doc.fillColor(MUTED).fontSize(9).font("Helvetica-Bold").text(right[0].toUpperCase(), 320, y);
  doc.fillColor("#111111").fontSize(10).font("Helvetica");
  let ry = y + 13;
  for (const line of right[1].filter(Boolean)) {
    doc.text(line, 320, ry, { width: 238 });
    ry += 13;
  }
  doc.y = Math.max(ly, ry) + 10;
}

function table(doc: PDFKit.PDFDocument, rows: Array<[string, string, string, string]>, head: [string, string, string, string]) {
  const x = [54, 340, 400, 470];
  const w = [280, 56, 66, 88];
  const rowH = 16;
  const drawRow = (r: [string, string, string, string], bold: boolean, y: number) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(bold ? MUTED : "#111111");
    r.forEach((cell, i) => doc.text(cell, x[i], y, { width: w[i], align: i === 0 ? "left" : "right" }));
  };
  let y = doc.y;
  drawRow(head, true, y);
  y += rowH;
  doc.moveTo(54, y - 3).lineTo(558, y - 3).lineWidth(0.5).strokeColor("#cccccc").stroke();
  for (const r of rows) {
    if (y > 700) {
      doc.addPage();
      y = 54;
    }
    const h = Math.max(rowH, doc.heightOfString(r[0], { width: w[0] }) + 4);
    drawRow(r, false, y);
    y += h;
  }
  doc.y = y + 6;
}

function totalsBlock(doc: PDFKit.PDFDocument, lines: Array<[string, string, boolean?]>) {
  let y = doc.y;
  for (const [label, value, bold] of lines) {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 11 : 10).fillColor("#111111");
    doc.text(label, 340, y, { width: 120, align: "right" });
    doc.text(value, 470, y, { width: 88, align: "right" });
    y += bold ? 18 : 15;
  }
  doc.y = y + 8;
}

function paragraph(doc: PDFKit.PDFDocument, title: string, text: string) {
  if (!text.trim()) return;
  if (doc.y > 650) doc.addPage();
  doc.fillColor(MUTED).fontSize(9).font("Helvetica-Bold").text(title.toUpperCase(), 54, doc.y);
  doc.moveDown(0.3);
  doc.fillColor("#111111").fontSize(9.5).font("Helvetica").text(text, 54, doc.y, { width: 504, lineGap: 1.5 });
  doc.moveDown(0.8);
}

async function signatureBlock(doc: PDFKit.PDFDocument, signerName: string | null, signedAt: string | null, signatureUrl: string | null, customerLabel = "Customer") {
  if (doc.y > 620) doc.addPage();
  const c = companyForDocuments();
  const y = doc.y + 10;
  doc.fillColor(MUTED).fontSize(9).font("Helvetica-Bold").text(customerLabel.toUpperCase(), 54, y);
  doc.text(c.legalName.toUpperCase(), 320, y);
  if (signatureUrl) {
    const buf = await signatureBuffer(signatureUrl);
    if (buf) {
      try {
        doc.image(buf, 54, y + 14, { fit: [180, 50] });
      } catch {
        /* unsupported image */
      }
    }
  }
  doc.moveTo(54, y + 70).lineTo(290, y + 70).strokeColor("#999999").lineWidth(0.5).stroke();
  doc.moveTo(320, y + 70).lineTo(558, y + 70).stroke();
  doc.fillColor("#111111").fontSize(9).font("Helvetica");
  doc.text(signerName ? `${signerName}${signedAt ? ` · ${new Date(signedAt).toLocaleDateString("en-CA")}` : ""}` : "Name / date", 54, y + 74);
  doc.text(`${c.signer} · ${new Date().toLocaleDateString("en-CA")}`, 320, y + 74);
  doc.y = y + 95;
}

async function signatureBuffer(url: string): Promise<Buffer | null> {
  if (url.startsWith("data:")) {
    const m = url.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
    return m ? Buffer.from(m[2], "base64") : null;
  }
  if (url.startsWith("/api/media/")) {
    const media = await readMedia(url.split("/").pop()!);
    return media && /png|jpe?g/.test(media.mime) ? media.buffer : null;
  }
  return null;
}

function footer(doc: PDFKit.PDFDocument, text: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fillColor(MUTED).fontSize(8).font("Helvetica").text(`${text}  ·  page ${i - range.start + 1} of ${range.count}`, 54, 760, { width: 504, align: "center" });
  }
}

const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }) : "—");

/* ------------------------------ renderers ------------------------------ */

export async function renderQuotePdf(data: AppData, q: Quote): Promise<Buffer> {
  const t = quoteTotals(q);
  const c = companyForDocuments();
  return build(async (doc) => {
    header(doc, "QUOTE", q.number, fmtDate(q.createdAt));
    twoCol(doc, ["Prepared for", [q.customerName, q.address, q.customerEmail, q.customerPhone]], ["Details", [`Project: ${q.title}`, `Valid until: ${fmtDate(q.validUntil)}`, `Deposit on acceptance: ${q.depositPercent}%`]]);
    paragraph(doc, "Scope of work", q.scope);
    table(
      doc,
      q.lines.map((l) => [l.description, `${l.quantity} ${l.unit}`, money(l.unitPrice), money(l.quantity * l.unitPrice)]),
      ["Description", "Qty", "Unit", "Amount"],
    );
    totalsBlock(doc, [
      ["Subtotal", money(t.subtotal)],
      ...(t.discount ? [["Discount", `-${money(t.discount)}`] as [string, string]] : []),
      [`HST (${Math.round(q.taxRate * 100)}%)`, money(t.tax)],
      ["Total", money(t.total), true],
      [`Deposit (${q.depositPercent}%)`, money(t.deposit)],
      ["Balance on completion", money(t.balance)],
    ]);
    paragraph(doc, "Notes", q.notes);
    paragraph(doc, "Terms", q.terms);
    await signatureBlock(doc, q.signerName, q.signedAt, q.signatureDataUrl, "Accepted by");
    footer(doc, `${c.legalName} · ${q.number}`);
  });
}

export async function renderContractPdf(data: AppData, job: Job, quote: Quote | null): Promise<Buffer> {
  const c = companyForDocuments();
  const lead = job.leadId ? data.leads.find((l) => l.id === job.leadId) : undefined;
  const total = quote ? quoteTotals(quote).total : job.contractValue;
  const deposit = quote ? quoteTotals(quote).deposit : Math.round(job.contractValue * 0.3);
  const number = nextNumber(data, "contract");
  return build(async (doc) => {
    header(doc, "CONTRACT", number, fmtDate(new Date().toISOString()));
    twoCol(doc, ["Customer", [job.customerName, job.address, lead?.email ?? "", lead?.phone ?? ""]], ["Contractor", [c.legalName, c.addressLine, c.phone, c.email]]);
    paragraph(
      doc,
      "Agreement",
      `This agreement is made between ${c.legalName} ("Contractor") and ${job.customerName} ("Customer") for the project "${job.title}" at ${job.address}${quote ? `, as described in Quote ${quote.number}` : ""}.`,
    );
    paragraph(doc, "Scope of work", quote?.scope || job.notes || "As per the attached quote.");
    if (quote?.lines.length) {
      table(doc, quote.lines.map((l) => [l.description, `${l.quantity} ${l.unit}`, money(l.unitPrice), money(l.quantity * l.unitPrice)]), ["Item", "Qty", "Unit", "Amount"]);
    }
    paragraph(doc, "Price and payment", `Contract price: ${money(total)} including HST. Deposit of ${money(deposit)} due on signing; balance due on completion. Accepted payment: Interac e-Transfer to ${c.email}, credit card via the online pay link, cheque.`);
    paragraph(doc, "Schedule", `Estimated start: ${fmtDate(job.startDate)}. Dates depend on weather, material delivery and permits; the Contractor will keep the Customer informed through the job portal.`);
    paragraph(doc, "Terms", quote?.terms || "See standard terms on the quote.");
    await signatureBlock(doc, quote?.signerName ?? null, quote?.signedAt ?? null, quote?.signatureDataUrl ?? null, "Customer");
    footer(doc, `${c.legalName} · ${number}`);
  });
}

export async function renderInvoicePdf(data: AppData, inv: InvoiceDoc, opts: { receipt?: boolean } = {}): Promise<Buffer> {
  const c = companyForDocuments();
  const job = data.jobs.find((j) => j.id === inv.jobId);
  const lead = job?.leadId ? data.leads.find((l) => l.id === job.leadId) : undefined;
  const total = invoiceTotal(inv);
  const paid = data.payments.filter((p) => p.invoiceId === inv.id && p.status === "succeeded").reduce((s, p) => s + p.amount, 0);
  const payUrl = inv.payUrl ?? (inv.token ? `${(process.env.APP_BASE_URL ?? "https://bhcontracting.ca").replace(/\/$/, "")}/pay/${inv.token}` : "");
  return build(async (doc) => {
    header(doc, opts.receipt ? "RECEIPT" : inv.kind === "full_report" ? "JOB REPORT" : "INVOICE", inv.number ?? inv.id.slice(0, 8).toUpperCase(), fmtDate(inv.createdAt));
    twoCol(doc, ["Bill to", [inv.customerName, job?.address ?? "", lead?.email ?? "", lead?.phone ?? ""]], ["Details", [`Job: ${job?.title ?? inv.jobId}`, job?.number ? `Job # ${job.number}` : "", inv.dueAt ? `Due: ${fmtDate(inv.dueAt)}` : "", `Status: ${opts.receipt ? "PAID" : inv.status.toUpperCase()}`]]);
    table(doc, inv.lines.map((l) => [l.description, String(l.quantity), money(l.unitPrice), money(l.quantity * l.unitPrice)]), ["Description", "Qty", "Unit", "Amount"]);
    const rows: Array<[string, string, boolean?]> = [["Total (HST included where applicable)", money(total), true]];
    if (paid) rows.push(["Paid", `-${money(paid)}`]);
    rows.push(["Balance due", money(Math.max(0, total - paid)), true]);
    totalsBlock(doc, rows);
    if (!opts.receipt && total - paid > 0) {
      paragraph(doc, "How to pay", `${payUrl ? `Pay online (card): ${payUrl}\n` : ""}Interac e-Transfer: ${c.email} (auto-deposit)\nCheque payable to ${c.legalName}`);
    }
    if (opts.receipt) paragraph(doc, "Thank you", `Payment received in full. ${c.legalName} appreciates your business.`);
    if (inv.aiSummary) paragraph(doc, "Work summary", inv.aiSummary);
    paragraph(doc, "Notes", inv.notes);
    footer(doc, `${c.legalName} · ${inv.number ?? ""}`);
  });
}

export async function renderJobReportPdf(data: AppData, job: Job, opts: { entryIds?: string[]; title?: string } = {}): Promise<{ buffer: Buffer; number: string }> {
  const c = companyForDocuments();
  const entries = data.jobProgress
    .filter((p) => p.jobId === job.id && (!opts.entryIds?.length || opts.entryIds.includes(p.id)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const number = nextNumber(data, "report");
  const materials = data.materials.filter((m) => m.jobId === job.id);
  const buffer = await build(async (doc) => {
    header(doc, "JOB REPORT", number, fmtDate(new Date().toISOString()));
    twoCol(doc, ["Customer", [job.customerName, job.address]], ["Job", [job.title, job.number ? `# ${job.number}` : "", `Status: ${job.status.replace("_", " ")}`, `Started: ${fmtDate(job.startDate)}`]]);
    if (opts.title) paragraph(doc, "Summary", opts.title);
    const summaries = entries.map((e) => e.aiSummary).filter(Boolean);
    if (summaries.length) paragraph(doc, "Progress summary", summaries[summaries.length - 1] as string);
    for (const e of entries) {
      if (doc.y > 600) doc.addPage();
      const author = data.employees.find((x) => x.id === e.authorId)?.name ?? "Crew";
      doc.fillColor(BRAND).fontSize(10).font("Helvetica-Bold").text(`${fmtDate(e.createdAt)} — ${author}`, 54, doc.y);
      doc.moveDown(0.2);
      doc.fillColor("#111111").fontSize(9.5).font("Helvetica").text(e.notes, 54, doc.y, { width: 504 });
      doc.moveDown(0.4);
      let x = 54;
      let rowY = doc.y;
      let placed = 0;
      for (const url of e.imageDataUrls.slice(0, 6)) {
        const buf = await signatureBuffer(url);
        if (!buf) continue;
        if (x + 160 > 558) {
          x = 54;
          rowY += 126;
        }
        if (rowY + 120 > 740) {
          doc.addPage();
          rowY = 54;
          x = 54;
        }
        try {
          doc.image(buf, x, rowY, { fit: [160, 120] });
          placed += 1;
          x += 168;
        } catch {
          /* skip bad image */
        }
      }
      doc.y = placed ? rowY + 130 : doc.y + 4;
    }
    if (materials.length) {
      if (doc.y > 620) doc.addPage();
      doc.fillColor(MUTED).fontSize(9).font("Helvetica-Bold").text("MATERIALS USED", 54, doc.y);
      doc.moveDown(0.4);
      table(doc, materials.map((m) => [m.description, String(m.quantity), money(m.unitCost), money(m.quantity * m.unitCost)]), ["Material", "Qty", "Unit", "Amount"]);
    }
    if (!entries.length) paragraph(doc, "Progress", "No site updates recorded yet.");
    footer(doc, `${c.legalName} · ${number}`);
  });
  return { buffer, number };
}

/* ----------------------------- orchestration ----------------------------- */

export type GenerateInput =
  | { kind: "quote"; quoteId: string }
  | { kind: "contract"; jobId: string }
  | { kind: "invoice"; invoiceId: string }
  | { kind: "receipt"; invoiceId: string }
  | { kind: "job_report"; jobId: string; entryIds?: string[]; title?: string };

/** Render, store under data/media, and record a JobDocument. */
export async function generateDocument(data: AppData, input: GenerateInput, ctx: Ctx & { createdById: string }): Promise<JobDocument> {
  let buffer: Buffer;
  let title: string;
  let number: string;
  let jobId: string | null = null;
  let leadId: string | null = null;
  let quoteId: string | null = null;
  let invoiceId: string | null = null;

  if (input.kind === "quote") {
    const q = data.quotes.find((x) => x.id === input.quoteId);
    if (!q) throw new Error("Quote not found");
    buffer = await renderQuotePdf(data, q);
    title = `Quote ${q.number} — ${q.title}`;
    number = q.number;
    jobId = q.jobId;
    leadId = q.leadId;
    quoteId = q.id;
  } else if (input.kind === "contract") {
    const job = data.jobs.find((j) => j.id === input.jobId);
    if (!job) throw new Error("Job not found");
    const quote = job.quoteId ? data.quotes.find((q) => q.id === job.quoteId) ?? null : data.quotes.find((q) => q.jobId === job.id && q.status === "signed") ?? null;
    buffer = await renderContractPdf(data, job, quote);
    number = nextNumber(data, "contract");
    title = `Contract ${number} — ${job.title}`;
    jobId = job.id;
    leadId = job.leadId;
    quoteId = quote?.id ?? null;
  } else if (input.kind === "invoice" || input.kind === "receipt") {
    const inv = data.invoices.find((i) => i.id === input.invoiceId);
    if (!inv) throw new Error("Invoice not found");
    if (!inv.number) inv.number = nextNumber(data, "invoice");
    buffer = await renderInvoicePdf(data, inv, { receipt: input.kind === "receipt" });
    number = input.kind === "receipt" ? nextNumber(data, "receipt") : inv.number;
    title = `${input.kind === "receipt" ? "Receipt" : inv.kind === "full_report" ? "Job report" : "Invoice"} ${inv.number} — ${inv.customerName}`;
    jobId = inv.jobId;
    invoiceId = inv.id;
    leadId = data.jobs.find((j) => j.id === inv.jobId)?.leadId ?? null;
  } else {
    const job = data.jobs.find((j) => j.id === input.jobId);
    if (!job) throw new Error("Job not found");
    const r = await renderJobReportPdf(data, job, { entryIds: input.entryIds, title: input.title });
    buffer = r.buffer;
    number = r.number;
    title = `Job report ${number} — ${job.title}`;
    jobId = job.id;
    leadId = job.leadId;
  }

  const fileUrl = await storeBuffer(buffer, "pdf", input.kind);
  const doc: JobDocument = {
    id: ctx.newId(),
    kind: input.kind as DocumentKind,
    title,
    number,
    jobId,
    leadId,
    quoteId,
    invoiceId,
    fileUrl,
    bytes: buffer.length,
    sentAt: null,
    sentTo: null,
    sentVia: null,
    createdById: ctx.createdById,
    createdAt: ctx.nowIso(),
  };
  data.documents.unshift(doc);
  if (input.kind === "quote" && quoteId) {
    const q = data.quotes.find((x) => x.id === quoteId);
    if (q) q.pdfUrl = fileUrl;
  }
  if (data.documents.length > 2000) data.documents.length = 2000;
  auditDocument(data, {
    jobId,
    authorId: ctx.createdById,
    subject: `Document generated: ${title}`,
    body: `${input.kind} · ${number} · ${Math.round(buffer.length / 1024)} KB`,
    nowIso: doc.createdAt,
    newId: ctx.newId,
  });
  live.document(`${title} generated`, `${Math.round(buffer.length / 1024)} KB`, { jobId: jobId ?? undefined, leadId: leadId ?? undefined, invoiceId: invoiceId ?? undefined });
  return doc;
}


/* ----------------------------- upload / delete / audit ----------------------------- */

function mediaFileFromUrl(fileUrl: string): string | null {
  const m = fileUrl.match(/\/api\/media\/([a-z0-9_-]+\.(?:jpg|png|webp|gif|pdf))$/i);
  return m ? m[1] : null;
}

function auditDocument(
  data: AppData,
  opts: {
    jobId: string | null;
    authorId: string;
    subject: string;
    body: string;
    nowIso: string;
    newId: () => string;
  },
) {
  if (!opts.jobId) return;
  const activity: CrmActivity = {
    id: opts.newId(),
    type: "note" as ActivityType,
    subject: opts.subject,
    body: opts.body,
    relatedType: "job",
    relatedId: opts.jobId,
    authorId: opts.authorId,
    dueAt: null,
    completedAt: null,
    createdAt: opts.nowIso,
  };
  data.activities.unshift(activity);
  if (data.activities.length > 2000) data.activities.length = 2000;
}

export type UploadDocumentInput = {
  jobId: string;
  kind: Extract<DocumentKind, "contract" | "invoice" | "quote" | "receipt" | "job_report">;
  title?: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  invoiceId?: string | null;
};

/** Attach an uploaded PDF (or image) to a job as a JobDocument + timeline audit. */
export async function uploadDocument(
  data: AppData,
  input: UploadDocumentInput,
  ctx: Ctx & { createdById: string },
): Promise<JobDocument> {
  const job = data.jobs.find((j) => j.id === input.jobId);
  if (!job) throw new Error("Job not found");

  const mime = (input.mimeType || "").toLowerCase();
  let ext: "pdf" | "jpg" | "png" | "webp";
  if (mime.includes("pdf") || input.fileName.toLowerCase().endsWith(".pdf")) ext = "pdf";
  else if (mime.includes("png") || input.fileName.toLowerCase().endsWith(".png")) ext = "png";
  else if (mime.includes("webp") || input.fileName.toLowerCase().endsWith(".webp")) ext = "webp";
  else if (mime.includes("jpeg") || mime.includes("jpg") || /\.jpe?g$/i.test(input.fileName)) ext = "jpg";
  else throw new Error("Only PDF or image uploads are supported for job documents.");

  if (input.buffer.length > 12 * 1024 * 1024) {
    throw new Error("File exceeds 12 MB limit.");
  }

  const number = nextNumber(data, input.kind === "job_report" ? "report" : input.kind);
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || `upload.${ext}`;
  const title =
    input.title?.trim() ||
    `Uploaded ${input.kind.replace("_", " ")} — ${safeName}`;

  const fileUrl = await storeBuffer(input.buffer, ext, `upload-${input.kind}`);
  const doc: JobDocument = {
    id: ctx.newId(),
    kind: input.kind,
    title,
    number,
    jobId: job.id,
    leadId: job.leadId,
    quoteId: null,
    invoiceId: input.invoiceId ?? null,
    fileUrl,
    bytes: input.buffer.length,
    sentAt: null,
    sentTo: null,
    sentVia: null,
    createdById: ctx.createdById,
    createdAt: ctx.nowIso(),
  };
  data.documents.unshift(doc);
  if (data.documents.length > 2000) data.documents.length = 2000;

  auditDocument(data, {
    jobId: job.id,
    authorId: ctx.createdById,
    subject: `Document uploaded: ${title}`,
    body: `${input.kind} · ${safeName} · ${Math.round(input.buffer.length / 1024)} KB · ${fileUrl}`,
    nowIso: doc.createdAt,
    newId: ctx.newId,
  });
  live.document(`${title} uploaded`, `${Math.round(input.buffer.length / 1024)} KB`, {
    jobId: job.id,
    leadId: job.leadId ?? undefined,
    invoiceId: input.invoiceId ?? undefined,
  });
  return doc;
}

/** Remove a job document, delete media when possible, and write a timeline audit. */
export async function deleteDocument(
  data: AppData,
  documentId: string,
  ctx: Ctx & { createdById: string },
): Promise<{ deleted: JobDocument }> {
  const idx = data.documents.findIndex((d) => d.id === documentId);
  if (idx < 0) throw new Error("Document not found");
  const [doc] = data.documents.splice(idx, 1);
  const file = mediaFileFromUrl(doc.fileUrl);
  if (file) await deleteMedia(file);

  auditDocument(data, {
    jobId: doc.jobId,
    authorId: ctx.createdById,
    subject: `Document deleted: ${doc.title}`,
    body: `${doc.kind} · ${doc.number} · removed by staff`,
    nowIso: ctx.nowIso(),
    newId: ctx.newId,
  });
  live.document(`${doc.title} deleted`, doc.number, {
    jobId: doc.jobId ?? undefined,
    leadId: doc.leadId ?? undefined,
    invoiceId: doc.invoiceId ?? undefined,
  });
  return { deleted: doc };
}
