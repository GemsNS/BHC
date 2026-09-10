import { classifyAd, draftReply } from "./ad-classify";
import { ingestRawAds, parseFeed, type RawAd } from "./ad-ingest";
import { live } from "./events";
import {
  hasReachableAdContact,
  isJunkAdTitle,
  isJunkDigestAd,
  isRealHttpUrl,
} from "./outreach-guard";
import { applyPayment, detectEtransfer, matchEtransferToInvoice } from "./payments";
import { handleInboundReply, sendPolicy, type SendPolicy } from "./outreach-send";
import { queueWebhook } from "./webhooks";
import { onLeadCreated } from "./workflows";
import type { AdListing, AdSource, AppData, Lead, OutreachQueueItem } from "./types";

/**
 * Ad → lead → drafted reply, end to end. Pure over AppData plus injected
 * I/O (fetcher for RSS, pollImap for mailboxes). Run by the automation
 * engine every 15 minutes, by POST /api/ads {action:"ingest"}, and by the
 * CLI (`npm run bhc -- ads ingest`).
 */

export type InboundMailLike = { fromAddress: string; from: string; subject: string; text: string; messageId?: string };

export type AdPipelineHooks = {
  fetcher?: typeof fetch;
  pollImap?: () => Promise<{ raws: RawAd[]; others?: InboundMailLike[]; messages: number; error: string | null }>;
  /** false → heuristics only (browser demo / tests) */
  ai?: boolean;
  now?: number;
  newId: () => string;
  nowIso: () => string;
  policy?: SendPolicy;
  /** Only classify/draft (skip polling sources) */
  skipPolling?: boolean;
  /** Max listings to classify per run (AI cost guard) */
  classifyLimit?: number;
};

export type AdPipelineResult = {
  polled: number;
  fetched: number;
  created: number;
  classified: number;
  qualified: number;
  leads: number;
  drafts: number;
  autoApproved: number;
  /** Prospect emails found in the mailbox and matched to sent outreach */
  replies: number;
  optOuts: number;
  errors: string[];
  summary: string;
};

function envInt(name: string, fallback: number): number {
  if (typeof process === "undefined") return fallback;
  const n = Number(process.env?.[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function adMinScore(): number {
  return envInt("ADS_MIN_SCORE", 55);
}

/* ------------------------------- polling -------------------------------- */

async function pollSource(
  data: AppData,
  source: AdSource,
  hooks: AdPipelineHooks,
  result: AdPipelineResult,
): Promise<void> {
  const fetcher = hooks.fetcher ?? fetch;
  let raws: RawAd[] = [];
  try {
    if (source.type === "rss") {
      if (!source.url) throw new Error("RSS source has no URL");
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 15_000) : null;
      const res = await fetcher(source.url, {
        headers: { "User-Agent": "BHC-CRM/1.0 (+https://bhcontracting.ca)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" },
        signal: controller?.signal,
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      raws = parseFeed(await res.text());
    } else if (source.type === "imap") {
      if (!hooks.pollImap) throw new Error("IMAP polling is only available on the Node host");
      const r = await hooks.pollImap();
      if (r.error) throw new Error(r.error);
      raws = r.raws;
      // Anything that is not a listing alert may be a prospect replying to us
      for (const mail of r.others ?? []) {
        if (!mail.fromAddress) continue;
        // Interac e-Transfer notifications → payments
        const et = detectEtransfer({ subject: mail.subject, text: mail.text, fromAddress: mail.fromAddress });
        if (et) {
          const inv = matchEtransferToInvoice(data, et);
          if (inv) {
            applyPayment(data, { invoiceId: inv.id, amount: et.amount, method: "etransfer", provider: "interac", providerId: mail.messageId ?? `et:${mail.subject}:${et.amount}`, note: `e-Transfer from ${et.senderName || "unknown"} (auto-matched)` }, hooks);
          } else {
            data.activities.unshift({ id: hooks.newId(), type: "task", subject: `Match e-Transfer $${et.amount.toLocaleString()} from ${et.senderName || "unknown"}`, body: mail.subject, relatedType: "job", relatedId: "general", authorId: "emp-admin", dueAt: hooks.nowIso(), completedAt: null, createdAt: hooks.nowIso() });
            live.payment(`e-Transfer $${et.amount.toLocaleString()} needs matching`, et.senderName || mail.subject);
          }
          continue;
        }
        // Prospect / customer replies (and STOP-style opt-outs)
        const outcome = handleInboundReply(
          data,
          { channel: "email", from: mail.fromAddress, body: mail.text, subject: mail.subject, messageId: mail.messageId },
          hooks,
        );
        if (outcome.optedOut) result.optOuts += 1;
        else if (outcome.matched) result.replies += 1;
        if (outcome.matched || outcome.optedOut) {
          data.messages.unshift({ id: hooks.newId(), channel: "email", direction: "in", from: mail.fromAddress, to: "", subject: mail.subject, body: mail.text.slice(0, 4000), leadId: outcome.leadId, jobId: null, adId: outcome.adId, provider: "imap", providerId: mail.messageId ?? null, status: "received", readAt: null, recordingUrl: null, transcription: null, durationSec: null, createdAt: hooks.nowIso() });
        }
      }
    } else {
      return; // webhook / manual sources are push-only
    }
    result.polled += 1;
    result.fetched += raws.length;
    const created = ingestRawAds(data, source, raws, hooks);
    result.created += created.length;
    source.lastPolledAt = hooks.nowIso();
    source.lastError = null;
    live.ad(`Polled ${source.name}`, `${raws.length} listing(s) seen · ${created.length} new`, undefined, created.length ? "success" : "info");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    source.lastPolledAt = hooks.nowIso();
    source.lastError = msg;
    result.errors.push(`${source.name}: ${msg}`);
    live.error("ad", `Source failed: ${source.name}`, msg);
  }
}

/* ------------------------------ qualifying ------------------------------ */

function leadFromAd(ad: AdListing, ctx: { newId: () => string; nowIso: () => string }): Lead {
  const stamp = ctx.nowIso();
  return {
    id: ctx.newId(),
    name: ad.contactName || `Ad poster — ${ad.title.slice(0, 40)}`,
    phone: ad.contactPhone,
    email: ad.contactEmail,
    address: ad.url || "See ad",
    city: ad.location || "HRM",
    source: `Ad · ${ad.sourceName}`,
    status: "new",
    jobType: ad.jobType ?? "residential",
    notes: `${ad.summary}\n\nAd: ${ad.title}\n${ad.url}\n\n${ad.body.slice(0, 1200)}`,
    assignedToId: null,
    companyId: null,
    leadScore: ad.score,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/** Classify + draft one listing. Exported so the UI can re-run it on demand. */
export async function qualifyListing(
  data: AppData,
  ad: AdListing,
  hooks: AdPipelineHooks,
  opts: { force?: boolean; minScore?: number } = {},
): Promise<{ qualified: boolean; lead: Lead | null; drafts: OutreachQueueItem[]; autoApproved: number }> {
  const policy = hooks.policy ?? sendPolicy();
  const minScore = opts.minScore ?? adMinScore();

  if (!opts.force && isJunkDigestAd(ad)) {
    ad.status = "skipped";
    live.ad(
      `Skipped junk listing: ${ad.title.slice(0, 70)}`,
      isJunkAdTitle(ad.title)
        ? "search-result digest / no listing URL"
        : !isRealHttpUrl(ad.url) && !hasReachableAdContact(ad)
          ? "no listing URL or reachable contact"
          : "not actionable",
      { adId: ad.id },
      "info",
    );
    return { qualified: false, lead: null, drafts: [], autoApproved: 0 };
  }

  const c = await classifyAd(ad, { ai: hooks.ai !== false });
  ad.score = c.score;
  ad.category = c.category;
  ad.jobType = c.jobType;
  ad.summary = c.summary;
  ad.reasons = c.reasons;
  ad.classifiedBy = c.by;
  if (c.contactName && !ad.contactName) ad.contactName = c.contactName;
  if (c.location && !ad.location) ad.location = c.location;

  if (!opts.force && (!c.isJobRequest || c.score < minScore)) {
    ad.status = "skipped";
    live.ad(`Skipped: ${ad.title.slice(0, 70)}`, `score ${c.score} · ${c.reasons[0] ?? c.summary}`, { adId: ad.id }, "info");
    return { qualified: false, lead: null, drafts: [], autoApproved: 0 };
  }
  ad.status = "qualified";
  live.ad(`Qualified: ${ad.title.slice(0, 70)}`, `score ${c.score} · ${c.category}${ad.location ? ` · ${ad.location}` : ""} · by ${c.by}`, { adId: ad.id }, "success");

  let lead = ad.leadId ? data.leads.find((l) => l.id === ad.leadId) ?? null : null;
  if (!lead) {
    lead = leadFromAd(ad, hooks);
    data.leads.unshift(lead);
    ad.leadId = lead.id;
    onLeadCreated(data, lead, "emp-admin");
    live.lead(`Lead created: ${lead.name}`, `${lead.source} · ${lead.jobType} · ${lead.city}`, { leadId: lead.id, adId: ad.id });
  }

  const draft = await draftReply(ad, { ai: hooks.ai !== false });
  const drafts: OutreachQueueItem[] = [];
  let autoApproved = 0;
  const stamp = hooks.nowIso();
  const base = {
    leadId: lead.id,
    prospectName: ad.contactName || lead.name,
    prospectEmail: ad.contactEmail,
    prospectPhone: ad.contactPhone,
    workflowRunId: null,
    scheduledAt: stamp,
    sentAt: null,
    createdAt: stamp,
    adId: ad.id,
  };

  const alreadyDrafted = new Set(
    data.outreachQueue.filter((o) => o.adId === ad.id && !o.followUpOf).map((o) => o.channel),
  );

  const push = (item: OutreachQueueItem) => {
    data.outreachQueue.unshift(item);
    ad.outreachIds.push(item.id);
    drafts.push(item);
    if (item.status === "approved") autoApproved += 1;
  };

  const statusFor = (channel: "email" | "sms") =>
    policy.autosend.has(channel) && ad.score >= policy.autosendMinScore ? "approved" : "pending_approval";

  if (ad.contactEmail && !alreadyDrafted.has("email")) {
    push({ ...base, id: hooks.newId(), channel: "email", subject: draft.emailSubject, message: draft.emailBody, status: statusFor("email") });
  }
  if (ad.contactPhone && !alreadyDrafted.has("sms")) {
    push({ ...base, id: hooks.newId(), channel: "sms", subject: `SMS reply: ${ad.title.slice(0, 50)}`, message: draft.smsBody, status: statusFor("sms") });
  }
  if (!ad.contactEmail && !ad.contactPhone && !alreadyDrafted.has("platform")) {
    push({
      ...base,
      id: hooks.newId(),
      channel: "platform",
      subject: draft.emailSubject,
      message: `${draft.emailBody}\n\n--- SMS-length version ---\n${draft.smsBody}`,
      status: "pending_approval",
    });
  }
  if (drafts.length) {
    ad.status = "drafted";
    live.outreach(
      `Reply drafted for ${ad.contactName || lead.name}`,
      `${drafts.map((d) => d.channel).join(" + ")} · ${draft.by === "ai" ? "Claude" : "template"}${autoApproved ? ` · ${autoApproved} auto-approved` : " · awaiting approval"}`,
      { adId: ad.id, leadId: lead.id },
      "out",
    );
  }

  queueWebhook(
    data,
    "ad.qualified",
    { adId: ad.id, leadId: lead.id, score: ad.score, category: ad.category, drafts: drafts.map((d) => d.channel) },
    hooks.newId,
    hooks.nowIso,
  );
  return { qualified: true, lead, drafts, autoApproved };
}

/* --------------------------------- run ---------------------------------- */

export async function runAdIngest(data: AppData, hooks: AdPipelineHooks): Promise<AdPipelineResult> {
  const result: AdPipelineResult = {
    polled: 0,
    fetched: 0,
    created: 0,
    classified: 0,
    qualified: 0,
    leads: 0,
    drafts: 0,
    autoApproved: 0,
    replies: 0,
    optOuts: 0,
    errors: [],
    summary: "",
  };

  if (!hooks.skipPolling) {
    for (const source of data.adSources) {
      if (!source.enabled) continue;
      await pollSource(data, source, hooks, result);
    }
  }

  const limit = hooks.classifyLimit ?? envInt("ADS_CLASSIFY_BATCH", 20);
  const fresh = data.adListings.filter((a) => a.status === "new").slice(0, limit);
  const leadsBefore = data.leads.length;
  for (const ad of fresh) {
    try {
      const r = await qualifyListing(data, ad, hooks);
      result.classified += 1;
      if (r.qualified) {
        result.qualified += 1;
        result.drafts += r.drafts.length;
        result.autoApproved += r.autoApproved;
      }
    } catch (err) {
      result.errors.push(`${ad.title.slice(0, 40)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  result.leads = data.leads.length - leadsBefore;

  const bits = [
    `${result.polled} source(s) polled`,
    `${result.created} new ad(s)`,
    `${result.classified} triaged`,
    `${result.qualified} qualified → ${result.leads} lead(s), ${result.drafts} draft(s)`,
  ];
  if (result.autoApproved) bits.push(`${result.autoApproved} auto-approved`);
  if (result.replies) bits.push(`${result.replies} prospect repl(y/ies) matched`);
  if (result.optOuts) bits.push(`${result.optOuts} opt-out(s)`);
  if (result.errors.length) bits.push(`${result.errors.length} error(s)`);
  result.summary = `Ad ingest: ${bits.join(" · ")}.`;
  return result;
}
