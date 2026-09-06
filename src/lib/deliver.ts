import { companyProfile } from "./ad-classify";
import { invoiceTotal, money } from "./customer-touches";
import { live } from "./events";
import { sendEmail } from "./mail";
import { readMedia } from "./media-store";
import { isOptedOut } from "./outreach-send";
import { invoicePayUrl, ensureInvoiceToken } from "./payments";
import { quotePublicUrl, quoteTotals } from "./quotes";
import { sendSms, smsConfigStatus } from "./sms";
import type { AppData, JobDocument, Message } from "./types";

/**
 * Send a generated document to the customer: email with the PDF attached
 * (plus the public link), and an SMS with the link when a phone is on file.
 * Records a Message per channel and stamps the document. Server-only.
 *
 * DOCS_AUTOSEND = comma list of kinds that go out automatically when generated
 * (e.g. "quote,invoice,receipt,job_report"). Anything else waits for a click.
 */

type Ctx = { newId: () => string; nowIso: () => string };

export function autosendKinds(): Set<string> {
  return new Set((process.env.DOCS_AUTOSEND ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

export function appBase(): string {
  return (process.env.APP_BASE_URL ?? "https://bhcontracting.ca").replace(/\/$/, "");
}

export type DeliveryResult = { email: "sent" | "failed" | "skipped"; sms: "sent" | "failed" | "skipped"; errors: string[] };

function recipient(data: AppData, doc: JobDocument): { name: string; email: string; phone: string; leadId: string | null } {
  const job = doc.jobId ? data.jobs.find((j) => j.id === doc.jobId) : undefined;
  const lead = (doc.leadId ? data.leads.find((l) => l.id === doc.leadId) : undefined) ?? (job?.leadId ? data.leads.find((l) => l.id === job.leadId) : undefined);
  const quote = doc.quoteId ? data.quotes.find((q) => q.id === doc.quoteId) : undefined;
  return {
    name: quote?.customerName || lead?.name || job?.customerName || "there",
    email: quote?.customerEmail || lead?.email || "",
    phone: quote?.customerPhone || lead?.phone || "",
    leadId: lead?.id ?? null,
  };
}

function composeFor(data: AppData, doc: JobDocument): { subject: string; body: string; sms: string; link: string } {
  const p = companyProfile();
  const base = appBase();
  const r = recipient(data, doc);
  const first = r.name.split(/\s+/)[0] || "there";
  const sig = `${p.signer}\n${p.name} · ${[p.phone, p.email].filter(Boolean).join(" · ")}`;
  const job = doc.jobId ? data.jobs.find((j) => j.id === doc.jobId) : undefined;
  const portal = job?.portalToken ? `${base}/portal/${job.portalToken}` : "";

  if (doc.kind === "quote") {
    const q = data.quotes.find((x) => x.id === doc.quoteId);
    const link = q ? quotePublicUrl(q, base) : `${base}${doc.fileUrl}`;
    const t = q ? quoteTotals(q) : null;
    return {
      link,
      subject: `${doc.number} — quote for ${q?.title ?? "your project"} from ${p.shortName}`,
      body: `Hi ${first},\n\nThanks for having us out. Your quote for ${q?.title ?? "the project"} is attached${t ? ` — ${money(t.total)} including HST, with a ${q?.depositPercent}% deposit on acceptance` : ""}.\n\nYou can review and sign it online here:\n${link}\n\nQuestions or changes? Just reply to this email${p.phone ? ` or text ${p.phone}` : ""}.\n\n${sig}`,
      sms: `Hi ${first}, ${p.signer} from ${p.shortName}. Your quote ${doc.number}${t ? ` (${money(t.total)})` : ""} is ready to review and sign: ${link}`,
    };
  }
  if (doc.kind === "invoice" || doc.kind === "receipt") {
    const inv = data.invoices.find((x) => x.id === doc.invoiceId);
    const link = inv?.token ? invoicePayUrl(inv, base) : `${base}${doc.fileUrl}`;
    const total = inv ? invoiceTotal(inv) - (inv.paidAmount ?? 0) : 0;
    if (doc.kind === "receipt") {
      return {
        link,
        subject: `Receipt ${doc.number} — thank you from ${p.shortName}`,
        body: `Hi ${first},\n\nPayment received — thank you. Your receipt is attached${portal ? ` and your job page is here: ${portal}` : ""}.\n\n${sig}`,
        sms: `Hi ${first}, ${p.shortName} here — payment received, thank you! Receipt: ${link}`,
      };
    }
    return {
      link,
      subject: `${inv?.number ?? doc.number} from ${p.shortName} — ${money(total)}`,
      body: `Hi ${first},\n\nPlease find ${inv?.number ?? "your invoice"} attached${inv?.dueAt ? ` (due ${new Date(inv.dueAt).toLocaleDateString("en-CA")})` : ""}.\n\nPay online: ${link}\nInterac e-Transfer: ${p.email}\n\nThanks again for your business.\n\n${sig}`,
      sms: `Hi ${first}, ${p.signer} from ${p.shortName}. ${inv?.number ?? "Your invoice"} (${money(total)}) is ready — pay online or view here: ${link}`,
    };
  }
  if (doc.kind === "contract") {
    const link = portal || `${base}${doc.fileUrl}`;
    return {
      link,
      subject: `${doc.number} — your contract with ${p.shortName}`,
      body: `Hi ${first},\n\nAttached is the contract for ${job?.title ?? "your project"} for your records.${portal ? `\n\nTrack the job, photos and invoices any time here:\n${portal}` : ""}\n\n${sig}`,
      sms: `Hi ${first}, ${p.shortName}: your contract for ${job?.title ?? "the project"} is on its way by email.${portal ? ` Job page: ${portal}` : ""}`,
    };
  }
  const link = portal || `${base}${doc.fileUrl}`;
  return {
    link,
    subject: `Progress update on ${job?.title ?? "your project"} — ${p.shortName}`,
    body: `Hi ${first},\n\nHere's the latest report on ${job?.title ?? "your project"} with photos from the crew (attached).${portal ? `\n\nFull history: ${portal}` : ""}\n\n${sig}`,
    sms: `Hi ${first}, ${p.shortName}: new progress photos and a report for ${job?.title ?? "your project"} are up: ${link}`,
  };
}

export async function deliverDocument(
  data: AppData,
  doc: JobDocument,
  ctx: Ctx,
  opts: { email?: boolean; sms?: boolean; to?: { email?: string; phone?: string }; note?: string } = {},
): Promise<DeliveryResult> {
  const result: DeliveryResult = { email: "skipped", sms: "skipped", errors: [] };
  const r = recipient(data, doc);
  const email = opts.to?.email ?? r.email;
  const phone = opts.to?.phone ?? r.phone;
  const composed = composeFor(data, doc);
  const wantEmail = opts.email ?? Boolean(email);
  const wantSms = opts.sms ?? Boolean(phone && smsConfigStatus().configured);
  const inv = doc.invoiceId ? data.invoices.find((i) => i.id === doc.invoiceId) : undefined;
  if (inv) ensureInvoiceToken(inv, ctx.newId);

  const record = (channel: Message["channel"], to: string, body: string, status: Message["status"], provider: string | null, providerId: string | null) => {
    data.messages.unshift({
      id: ctx.newId(),
      channel,
      direction: "out",
      from: channel === "sms" ? smsConfigStatus().from ?? "" : companyProfile().email,
      to,
      subject: channel === "email" ? composed.subject : "",
      body,
      leadId: r.leadId,
      jobId: doc.jobId,
      adId: null,
      provider,
      providerId,
      status,
      readAt: ctx.nowIso(),
      recordingUrl: null,
      transcription: null,
      durationSec: null,
      createdAt: ctx.nowIso(),
    });
  };

  if (wantEmail && email) {
    if (isOptedOut(data, "email", email)) {
      result.errors.push("email opted out");
    } else {
      const file = await readMedia(doc.fileUrl.split("/").pop()!);
      const body = opts.note ? `${composed.body}\n\nP.S. ${opts.note}` : composed.body;
      const res = await sendEmail({
        to: email,
        subject: composed.subject,
        text: body,
        attachments: file ? [{ filename: `${doc.number}.pdf`, content: file.buffer, contentType: "application/pdf" }] : undefined,
      });
      result.email = res.ok ? "sent" : "failed";
      if (!res.ok) result.errors.push(res.error ?? "email failed");
      record("email", email, body, res.ok ? "sent" : "failed", res.provider, res.id);
    }
  }
  if (wantSms && phone) {
    if (isOptedOut(data, "sms", phone)) {
      result.errors.push("sms opted out");
    } else {
      const res = await sendSms({ to: phone, body: composed.sms });
      result.sms = res.ok ? "sent" : "failed";
      if (!res.ok) result.errors.push(res.error ?? "sms failed");
      record("sms", phone, composed.sms, res.ok ? "sent" : "failed", res.provider, res.id);
    }
  }

  if (result.email === "sent" || result.sms === "sent") {
    doc.sentAt = ctx.nowIso();
    doc.sentTo = [result.email === "sent" ? email : "", result.sms === "sent" ? phone : ""].filter(Boolean).join(", ");
    doc.sentVia = [result.email === "sent" ? "email" : "", result.sms === "sent" ? "sms" : ""].filter(Boolean).join("+");
    if (doc.kind === "quote" && doc.quoteId) {
      const q = data.quotes.find((x) => x.id === doc.quoteId);
      if (q && (q.status === "draft" || q.status === "expired")) {
        q.status = "sent";
        q.sentAt = q.sentAt ?? ctx.nowIso();
      }
    }
    if (doc.kind === "invoice" && inv && inv.status === "draft") {
      inv.status = "sent";
      inv.sentAt = ctx.nowIso();
      inv.dueAt = inv.dueAt ?? new Date(Date.now() + 14 * 86_400_000).toISOString();
    }
    live.document(`${doc.title} sent to ${r.name}`, `via ${doc.sentVia}`, { jobId: doc.jobId ?? undefined, leadId: r.leadId ?? undefined, invoiceId: doc.invoiceId ?? undefined });
  } else if (!wantEmail && !wantSms) {
    result.errors.push("no email or phone on file for the customer");
  }
  return result;
}
