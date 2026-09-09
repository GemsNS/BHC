import { draftFollowUpLocal } from "./ad-classify";
import { live } from "./events";
import { enqueueNotification } from "./notifications";
import { looksFabricatedProspect, isRealContactEmail, isPlaceholderPhone } from "./outreach-guard";
import { toE164 } from "./sms";
import { queueWebhook } from "./webhooks";
import type { AppData, OptOutRecord, OutreachQueueItem } from "./types";

/**
 * Turns approved outreach drafts into real emails / texts, and queues
 * follow-ups for replies that went quiet. Senders are injected so the same
 * code runs in tests (mocks), the browser demo (no senders) and the server.
 */

export type SendOutcome = { ok: boolean; provider?: string | null; id?: string | null; error?: string | null };
export type EmailSender = (msg: { to: string; subject: string; text: string }) => Promise<SendOutcome>;
export type SmsSender = (msg: { to: string; body: string }) => Promise<SendOutcome>;

export type Senders = { email?: EmailSender; sms?: SmsSender };

export type SendPolicy = {
  /** Channels that may send without a human approving each draft */
  autosend: Set<"email" | "sms">;
  /** Minimum ad score for autosend to apply */
  autosendMinScore: number;
  /** Max outbound messages per calendar day (all channels) */
  dailyCap: number;
  /** Local hours [start, end) during which SMS is NOT sent (e.g. 21 → 8) */
  quietStart: number;
  quietEnd: number;
  /** Days without a reply before a follow-up draft is created */
  followUpDays: number;
  /** Max follow-ups per ad */
  maxFollowUps: number;
};

function env(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const v = process.env?.[name]?.trim();
  return v || undefined;
}

export function sendPolicy(): SendPolicy {
  const raw = (env("OUTREACH_AUTOSEND") ?? "").toLowerCase();
  const autosend = new Set<"email" | "sms">();
  if (raw === "all" || raw === "1" || raw === "true") {
    autosend.add("email");
    autosend.add("sms");
  } else {
    for (const part of raw.split(/[,\s]+/)) {
      if (part === "email" || part === "sms") autosend.add(part);
    }
  }
  const quiet = (env("OUTREACH_QUIET_HOURS") ?? "21-8").split("-").map((n) => Number(n));
  return {
    autosend,
    autosendMinScore: Number(env("ADS_AUTOSEND_MIN_SCORE") ?? "75") || 75,
    dailyCap: Number(env("OUTREACH_DAILY_CAP") ?? "25") || 25,
    quietStart: Number.isFinite(quiet[0]) ? quiet[0] : 21,
    quietEnd: Number.isFinite(quiet[1]) ? quiet[1] : 8,
    followUpDays: Number(env("OUTREACH_FOLLOWUP_DAYS") ?? "3") || 3,
    maxFollowUps: Number(env("OUTREACH_MAX_FOLLOWUPS") ?? "1") || 1,
  };
}

export function inQuietHours(policy: SendPolicy, now = new Date()): boolean {
  const h = now.getHours();
  if (policy.quietStart === policy.quietEnd) return false;
  return policy.quietStart > policy.quietEnd
    ? h >= policy.quietStart || h < policy.quietEnd // wraps midnight
    : h >= policy.quietStart && h < policy.quietEnd;
}

export function sentToday(data: AppData, now = new Date()): number {
  const key = now.toDateString();
  return data.outreachQueue.filter((o) => o.sentAt && new Date(o.sentAt).toDateString() === key).length;
}

export type ProcessResult = {
  sent: number;
  failed: number;
  deferred: number;
  skipped: number;
  summary: string;
};

type Ctx = { newId: () => string; nowIso: () => string; now?: number };

function logActivity(data: AppData, item: OutreachQueueItem, ctx: Ctx, note: string) {
  if (!item.leadId) return;
  data.activities.unshift({
    id: ctx.newId(),
    type: item.channel === "sms" ? "call" : "email",
    subject: item.channel === "sms" ? `SMS: ${item.message.slice(0, 60)}` : item.subject,
    body: note,
    relatedType: "lead",
    relatedId: item.leadId,
    authorId: "emp-admin",
    dueAt: null,
    completedAt: ctx.nowIso(),
    createdAt: ctx.nowIso(),
  });
}

/**
 * Send every `approved` item that has a real destination. `pending_approval`
 * items are never sent here — the ad pipeline promotes them to `approved`
 * only when the autosend policy allows it.
 */
export async function processOutreachQueue(
  data: AppData,
  ctx: Ctx,
  senders: Senders,
  policy = sendPolicy(),
): Promise<ProcessResult> {
  const now = new Date(ctx.now ?? Date.now());
  const result: ProcessResult = { sent: 0, failed: 0, deferred: 0, skipped: 0, summary: "" };
  let budget = policy.dailyCap - sentToday(data, now);
  const quiet = inQuietHours(policy, now);

  const approved = data.outreachQueue.filter((o) => o.status === "approved");
  for (const item of approved) {
    if (item.channel === "call" || item.channel === "platform") {
      result.skipped += 1; // manual channels — nothing to send
      continue;
    }
    if (
      looksFabricatedProspect({
        name: item.prospectName,
        email: item.prospectEmail,
        phone: item.prospectPhone,
      }) ||
      (item.channel === "email" && !isRealContactEmail(item.prospectEmail)) ||
      (item.channel === "sms" && isPlaceholderPhone(item.prospectPhone))
    ) {
      item.status = "cancelled";
      item.error = "Synthetic / invalid contact — blocked from send.";
      result.skipped += 1;
      live.system(
        `Blocked synthetic outreach: ${item.prospectName}`,
        item.prospectEmail || item.prospectPhone || item.id,
        "warn",
      );
      continue;
    }
    const sender = item.channel === "sms" ? senders.sms : senders.email;
    const destination = item.channel === "sms" ? item.prospectPhone : item.prospectEmail;
    if (destination && isOptedOut(data, item.channel, destination)) {
      item.status = "cancelled";
      item.error = "Recipient opted out — not sent.";
      result.skipped += 1;
      continue;
    }
    if (!sender) {
      result.deferred += 1;
      continue;
    }
    if (!destination) {
      item.status = "failed";
      item.error = `No ${item.channel === "sms" ? "phone number" : "email address"} on file.`;
      result.failed += 1;
      continue;
    }
    if (budget <= 0) {
      result.deferred += 1;
      continue;
    }
    if (item.channel === "sms" && quiet) {
      result.deferred += 1;
      continue;
    }
    if (item.scheduledAt && new Date(item.scheduledAt).getTime() > now.getTime()) {
      result.deferred += 1;
      continue;
    }

    const outcome =
      item.channel === "sms"
        ? await senders.sms!({ to: destination, body: item.message })
        : await senders.email!({ to: destination, subject: item.subject, text: item.message });

    if (outcome.ok) {
      item.status = "sent";
      item.sentAt = ctx.nowIso();
      item.provider = outcome.provider ?? null;
      item.providerMessageId = outcome.id ?? null;
      item.error = null;
      budget -= 1;
      result.sent += 1;
      data.messages.unshift({
        id: ctx.newId(),
        channel: item.channel,
        direction: "out",
        from: "",
        to: destination,
        subject: item.channel === "email" ? item.subject : "",
        body: item.message,
        leadId: item.leadId,
        jobId: item.jobId ?? null,
        adId: item.adId ?? null,
        provider: outcome.provider ?? null,
        providerId: outcome.id ?? null,
        status: "sent",
        readAt: ctx.nowIso(),
        recordingUrl: null,
        transcription: null,
        durationSec: null,
        createdAt: ctx.nowIso(),
      });
      logActivity(data, item, ctx, `[Outreach sent via ${outcome.provider ?? item.channel}] ${item.message}`);
      if (item.adId) {
        const ad = data.adListings.find((a) => a.id === item.adId);
        if (ad && (ad.status === "drafted" || ad.status === "qualified")) ad.status = "sent";
      }
      if (item.leadId) {
        const lead = data.leads.find((l) => l.id === item.leadId);
        if (lead && lead.status === "new") {
          lead.status = "contacted";
          lead.updatedAt = ctx.nowIso();
        }
      }
      queueWebhook(
        data,
        "outreach.sent",
        { outreachId: item.id, channel: item.channel, leadId: item.leadId, adId: item.adId ?? null, provider: outcome.provider ?? null },
        ctx.newId,
        ctx.nowIso,
      );
      live.outreach(
        `${item.channel.toUpperCase()} sent to ${item.prospectName || destination}`,
        `${item.kind ?? "reply"} · via ${outcome.provider ?? item.channel}${item.channel === "email" ? ` · ${item.subject.slice(0, 60)}` : ""}`,
        { leadId: item.leadId ?? undefined, adId: item.adId ?? undefined, jobId: item.jobId ?? undefined },
        "success",
      );
    } else {
      item.status = "failed";
      item.error = outcome.error ?? "send failed";
      result.failed += 1;
      live.error("outreach", `${item.channel.toUpperCase()} to ${destination} failed`, item.error);
    }
  }

  const parts = [`${result.sent} sent`];
  if (result.failed) parts.push(`${result.failed} failed`);
  if (result.deferred) parts.push(`${result.deferred} deferred${quiet ? " (quiet hours/cap/no sender)" : " (cap/no sender)"}`);
  if (result.skipped) parts.push(`${result.skipped} manual`);
  result.summary = `Outreach: ${parts.join(", ")}.`;
  return result;
}

/**
 * For ad replies that were sent and never answered, create ONE follow-up
 * draft (pending approval) after `followUpDays`. Idempotent.
 */
export function expireDays(): number {
  const n = Number(env("OUTREACH_EXPIRE_DAYS") ?? "21");
  return Number.isFinite(n) && n > 0 ? n : 21;
}

export function queueFollowUps(data: AppData, ctx: Ctx, policy = sendPolicy()): { created: number; expired: number; summary: string } {
  const now = ctx.now ?? Date.now();
  const cutoff = now - policy.followUpDays * 86_400_000;
  const expireCutoff = now - expireDays() * 86_400_000;
  let created = 0;
  let expired = 0;

  // Close the loop on ads nobody answered: after OUTREACH_EXPIRE_DAYS mark lost and cancel drafts
  for (const ad of data.adListings) {
    if (ad.status !== "sent") continue;
    const lastSent = data.outreachQueue
      .filter((o) => o.adId === ad.id && o.sentAt)
      .map((o) => new Date(o.sentAt!).getTime())
      .sort((a, b) => b - a)[0];
    if (!lastSent || lastSent > expireCutoff) continue;
    ad.status = "lost";
    ad.notes = `${ad.notes}\nAuto-closed: no reply ${expireDays()} days after last message.`.trim();
    for (const o of data.outreachQueue) {
      if (o.adId === ad.id && (o.status === "pending_approval" || o.status === "approved")) o.status = "cancelled";
    }
    if (ad.leadId) {
      const lead = data.leads.find((l) => l.id === ad.leadId);
      if (lead && (lead.status === "new" || lead.status === "contacted")) {
        lead.status = "lost";
        lead.updatedAt = ctx.nowIso();
      }
    }
    expired += 1;
  }
  for (const item of data.outreachQueue) {
    if (!item.adId || item.status !== "sent" || !item.sentAt || item.repliedAt) continue;
    if (item.channel !== "email" && item.channel !== "sms") continue;
    if (new Date(item.sentAt).getTime() > cutoff) continue;
    const ad = data.adListings.find((a) => a.id === item.adId);
    if (!ad || ad.repliedAt || ad.status === "replied" || ad.status === "won" || ad.status === "lost" || ad.status === "skipped") continue;
    const followUps = data.outreachQueue.filter((o) => o.adId === item.adId && o.followUpOf);
    if (followUps.length >= policy.maxFollowUps) continue;
    if (followUps.some((f) => f.followUpOf === item.id)) continue;

    const draft = draftFollowUpLocal(ad, item.channel);
    const fu: OutreachQueueItem = {
      id: ctx.newId(),
      leadId: item.leadId,
      prospectName: item.prospectName,
      prospectEmail: item.prospectEmail,
      prospectPhone: item.prospectPhone,
      channel: item.channel,
      subject: draft.subject || item.subject,
      message: draft.body,
      status: policy.autosend.has(item.channel) && ad.score >= policy.autosendMinScore ? "approved" : "pending_approval",
      workflowRunId: null,
      scheduledAt: ctx.nowIso(),
      sentAt: null,
      createdAt: ctx.nowIso(),
      adId: item.adId,
      followUpOf: item.id,
    };
    data.outreachQueue.unshift(fu);
    ad.outreachIds.push(fu.id);
    created += 1;
  }
  return {
    created,
    expired,
    summary: `Follow-ups: ${created} draft(s) created for unanswered ad replies${expired ? `, ${expired} stale ad(s) auto-closed` : ""}.`,
  };
}

/* ------------------------------ opt-outs ------------------------------ */

export function normalizeAddress(channel: "sms" | "email", address: string): string {
  if (channel === "sms") return toE164(address) ?? address.replace(/\D/g, "");
  // "Jane Doe <JANE@example.com>" → "jane@example.com"
  const m = address.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return (m ? m[0] : address).trim().toLowerCase();
}

export function isOptedOut(data: AppData, channel: "sms" | "email", address: string): boolean {
  const key = normalizeAddress(channel, address);
  return data.optOuts.some((o) => o.channel === channel && o.address === key);
}

export function recordOptOut(
  data: AppData,
  input: { channel: "sms" | "email"; address: string; reason: string; source: OptOutRecord["source"] },
  ctx: Ctx,
): OptOutRecord {
  const key = normalizeAddress(input.channel, input.address);
  const existing = data.optOuts.find((o) => o.channel === input.channel && o.address === key);
  if (existing) return existing;
  const rec: OptOutRecord = {
    id: ctx.newId(),
    channel: input.channel,
    address: key,
    reason: input.reason.slice(0, 200),
    source: input.source,
    createdAt: ctx.nowIso(),
  };
  data.optOuts.unshift(rec);
  // Cancel anything still queued for this person
  for (const o of data.outreachQueue) {
    const dest = o.channel === "sms" ? o.prospectPhone : o.prospectEmail;
    if (o.channel === input.channel && dest && normalizeAddress(input.channel, dest) === key && (o.status === "pending_approval" || o.status === "approved" || o.status === "queued")) {
      o.status = "cancelled";
      o.error = "Recipient opted out.";
    }
  }
  queueWebhook(data, "outreach.opted_out", { channel: input.channel, address: key, reason: rec.reason }, ctx.newId, ctx.nowIso);
  return rec;
}

const STOP_RE = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|remove me|no thanks|not interested|do not contact|don'?t contact)\b/i;
const SOFT_NO_RE = /\b(no thanks|not interested|already (found|hired|booked)|found someone|please stop|unsubscribe|remove me)\b/i;

export type InboundReply = {
  channel: "sms" | "email";
  from: string;
  body: string;
  subject?: string;
  messageId?: string;
};

export type InboundOutcome = {
  matched: boolean;
  optedOut: boolean;
  adId: string | null;
  leadId: string | null;
  outreachId: string | null;
};

/**
 * Route an inbound SMS / email from a prospect: STOP-style messages become
 * opt-outs, anything else marks the ad/outreach as replied and alerts the team.
 */
export function handleInboundReply(data: AppData, reply: InboundReply, ctx: Ctx): InboundOutcome {
  const key = normalizeAddress(reply.channel, reply.from);
  const candidates = data.outreachQueue
    .filter((o) => o.channel === reply.channel && o.status === "sent")
    .filter((o) => normalizeAddress(reply.channel, reply.channel === "sms" ? o.prospectPhone : o.prospectEmail) === key)
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));
  const item = candidates[0] ?? null;
  const lead = item?.leadId ? data.leads.find((l) => l.id === item.leadId) ?? null : data.leads.find((l) => (reply.channel === "sms" ? normalizeAddress("sms", l.phone) === key : l.email.toLowerCase() === key)) ?? null;
  const body = reply.body.trim();
  const isStop = reply.channel === "sms" ? STOP_RE.test(body) : SOFT_NO_RE.test(body) && body.length < 400;

  const outcome: InboundOutcome = {
    matched: Boolean(item || lead),
    optedOut: false,
    adId: item?.adId ?? null,
    leadId: lead?.id ?? item?.leadId ?? null,
    outreachId: item?.id ?? null,
  };

  if (isStop) {
    recordOptOut(data, { channel: reply.channel, address: reply.from, reason: body.slice(0, 120) || "STOP", source: reply.channel === "sms" ? "sms_inbound" : "email_inbound" }, ctx);
    outcome.optedOut = true;
    live.reply(`${lead?.name ?? key} opted out (${reply.channel})`, body.slice(0, 80), { leadId: lead?.id });
    if (item?.adId) {
      const ad = data.adListings.find((a) => a.id === item.adId);
      if (ad && ad.status !== "won") ad.status = "lost";
    }
    if (lead && lead.status !== "won") {
      lead.status = "lost";
      lead.updatedAt = ctx.nowIso();
    }
    return outcome;
  }

  if (!outcome.matched) {
    live.message(`Unmatched inbound ${reply.channel} from ${key}`, body.slice(0, 80), undefined, "warn");
    return outcome;
  }

  const stamp = ctx.nowIso();
  live.reply(`${lead?.name ?? key} replied by ${reply.channel}`, body.slice(0, 100), { leadId: lead?.id, adId: item?.adId ?? undefined });
  if (item) {
    item.repliedAt = stamp;
    if (item.adId) markAdReplied(data, item.adId, ctx);
  }
  if (lead && lead.status === "new") {
    lead.status = "contacted";
    lead.updatedAt = stamp;
  }
  if (lead) {
    data.activities.unshift({
      id: ctx.newId(),
      type: reply.channel === "sms" ? "call" : "email",
      subject: reply.channel === "sms" ? `Inbound SMS from ${lead.name}` : reply.subject || `Reply from ${lead.name}`,
      body,
      relatedType: "lead",
      relatedId: lead.id,
      authorId: "emp-admin",
      dueAt: null,
      completedAt: stamp,
      createdAt: stamp,
    });
    data.activities.unshift({
      id: ctx.newId(),
      type: "task",
      subject: `Reply to ${lead.name} (${reply.channel})`,
      body: body.slice(0, 300),
      relatedType: "lead",
      relatedId: lead.id,
      authorId: lead.assignedToId ?? "emp-admin",
      dueAt: stamp,
      completedAt: null,
      createdAt: stamp,
    });
  }
  enqueueNotification(
    data,
    {
      employeeId: lead?.assignedToId ?? null,
      title: `${lead?.name ?? reply.from} replied by ${reply.channel}`,
      body: body.slice(0, 160),
      href: item?.adId ? "/admin/ads" : "/admin/sales?tab=pipeline",
      dedupeKey: `reply:${reply.messageId ?? `${key}:${stamp.slice(0, 16)}`}`,
    },
    ctx.newId,
    ctx.nowIso,
  );
  queueWebhook(data, "outreach.replied", { channel: reply.channel, from: key, leadId: outcome.leadId, adId: outcome.adId, preview: body.slice(0, 200) }, ctx.newId, ctx.nowIso);
  return outcome;
}

/** Mark an ad (and its outreach) as replied — stops follow-ups, moves the lead forward. */
export function markAdReplied(data: AppData, adId: string, ctx: Ctx): boolean {
  const ad = data.adListings.find((a) => a.id === adId);
  if (!ad) return false;
  ad.repliedAt = ctx.nowIso();
  ad.status = "replied";
  for (const o of data.outreachQueue) if (o.adId === adId && !o.repliedAt) o.repliedAt = ad.repliedAt;
  if (ad.leadId) {
    const lead = data.leads.find((l) => l.id === ad.leadId);
    if (lead && lead.status === "new") {
      lead.status = "contacted";
      lead.updatedAt = ctx.nowIso();
    }
  }
  return true;
}
