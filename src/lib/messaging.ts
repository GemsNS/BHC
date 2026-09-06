import { companyProfile } from "./ad-classify";
import { completeChat } from "./ai-provider";
import { live } from "./events";
import { enqueueNotification } from "./notifications";
import { handleInboundReply, isOptedOut, normalizeAddress } from "./outreach-send";
import { toE164 } from "./sms";
import type { AppData, Lead, Message } from "./types";

/**
 * Two-way messaging: every SMS / email / voice interaction with a customer
 * or prospect is a `Message`; threads are grouped by the other party.
 * Pure helpers here; senders are injected by the routes.
 */

type Ctx = { newId: () => string; nowIso: () => string };

export function findLeadByAddress(data: AppData, channel: "sms" | "email", address: string): Lead | undefined {
  const key = normalizeAddress(channel, address);
  if (!key) return undefined;
  return data.leads.find((l) => (channel === "sms" ? normalizeAddress("sms", l.phone) === key : l.email.toLowerCase() === key));
}

export function recordMessage(
  data: AppData,
  input: Omit<Message, "id" | "createdAt" | "readAt"> & { readAt?: string | null },
  ctx: Ctx,
): Message {
  const m: Message = { id: ctx.newId(), createdAt: ctx.nowIso(), readAt: input.readAt ?? (input.direction === "out" ? ctx.nowIso() : null), ...input };
  data.messages.unshift(m);
  if (data.messages.length > 5000) data.messages.length = 5000;
  return m;
}

/**
 * Inbound SMS/email from anyone: route through the outreach reply handler
 * (STOP, ad replies), then make sure there is a lead + message + alert so
 * nothing from a customer is lost.
 */
export function receiveInbound(
  data: AppData,
  input: { channel: "sms" | "email"; from: string; body: string; subject?: string; providerId?: string | null; provider?: string | null },
  ctx: Ctx,
): { message: Message; lead: Lead | null; optedOut: boolean; newLead: boolean } {
  const outcome = handleInboundReply(data, { channel: input.channel, from: input.from, body: input.body, subject: input.subject, messageId: input.providerId ?? undefined }, ctx);
  let lead = outcome.leadId ? data.leads.find((l) => l.id === outcome.leadId) ?? null : findLeadByAddress(data, input.channel, input.from) ?? null;
  let newLead = false;
  if (!lead && !outcome.optedOut) {
    const stamp = ctx.nowIso();
    lead = {
      id: ctx.newId(),
      name: input.channel === "sms" ? `Text from ${toE164(input.from) ?? input.from}` : input.from.replace(/<.*>/, "").trim() || input.from,
      phone: input.channel === "sms" ? (toE164(input.from) ?? input.from) : "",
      email: input.channel === "email" ? normalizeAddress("email", input.from) : "",
      address: "TBD",
      city: "",
      source: input.channel === "sms" ? "Inbound text" : "Inbound email",
      status: "new",
      jobType: "residential",
      notes: input.body.slice(0, 500),
      assignedToId: null,
      companyId: null,
      leadScore: 60,
      createdAt: stamp,
      updatedAt: stamp,
    };
    data.leads.unshift(lead);
    newLead = true;
    live.lead(`New lead from inbound ${input.channel}`, input.body.slice(0, 80), { leadId: lead.id });
  }
  const job = lead ? data.jobs.find((j) => j.leadId === lead!.id && (j.status === "scheduled" || j.status === "in_progress")) : undefined;
  const message = recordMessage(
    data,
    {
      channel: input.channel,
      direction: "in",
      from: input.from,
      to: input.channel === "sms" ? process.env.TWILIO_FROM_NUMBER ?? "" : companyProfile().email,
      subject: input.subject ?? "",
      body: input.body,
      leadId: lead?.id ?? null,
      jobId: job?.id ?? null,
      adId: outcome.adId,
      provider: input.provider ?? (input.channel === "sms" ? "twilio" : "imap"),
      providerId: input.providerId ?? null,
      status: "received",
      recordingUrl: null,
      transcription: null,
      durationSec: null,
    },
    ctx,
  );
  if (!outcome.matched && lead && !outcome.optedOut) {
    // handleInboundReply only alerts for matched prospects — cover walk-ins too
    const stamp = ctx.nowIso();
    data.activities.unshift({ id: ctx.newId(), type: "task", subject: `Reply to ${lead.name} (${input.channel})`, body: input.body.slice(0, 300), relatedType: "lead", relatedId: lead.id, authorId: lead.assignedToId ?? "emp-admin", dueAt: stamp, completedAt: null, createdAt: stamp });
    enqueueNotification(data, { employeeId: lead.assignedToId, title: `${lead.name} sent a ${input.channel === "sms" ? "text" : "message"}`, body: input.body.slice(0, 140), href: "/admin/inbox", dedupeKey: `msg:${message.id}` }, ctx.newId, ctx.nowIso);
    live.message(`${lead.name}: ${input.body.slice(0, 80)}`, `inbound ${input.channel}${newLead ? " · new lead" : ""}`, { leadId: lead.id, jobId: job?.id });
  }
  return { message, lead, optedOut: outcome.optedOut, newLead };
}

export type Thread = {
  key: string;
  channel: "sms" | "email";
  address: string;
  name: string;
  leadId: string | null;
  jobId: string | null;
  lastAt: string;
  lastBody: string;
  unread: number;
  count: number;
};

export function buildThreads(data: AppData, limit = 100): Thread[] {
  const map = new Map<string, Thread>();
  for (const m of data.messages) {
    if (m.channel === "voice" && !m.transcription && !m.body) continue;
    const channel: "sms" | "email" = m.channel === "email" ? "email" : "sms";
    const other = m.direction === "in" ? m.from : m.to;
    const address = normalizeAddress(channel, other) || other;
    if (!address || address === "portal") continue;
    const key = `${channel}:${address}`;
    const lead = m.leadId ? data.leads.find((l) => l.id === m.leadId) : findLeadByAddress(data, channel, address);
    const t = map.get(key);
    if (t) {
      t.count += 1;
      if (m.direction === "in" && !m.readAt) t.unread += 1;
      if (m.createdAt > t.lastAt) {
        t.lastAt = m.createdAt;
        t.lastBody = m.transcription ?? m.body;
      }
      if (!t.leadId && lead) t.leadId = lead.id;
      if (!t.jobId && m.jobId) t.jobId = m.jobId;
    } else {
      map.set(key, {
        key,
        channel,
        address,
        name: lead?.name ?? (m.direction === "in" ? m.from : m.to),
        leadId: lead?.id ?? m.leadId ?? null,
        jobId: m.jobId,
        lastAt: m.createdAt,
        lastBody: m.transcription ?? m.body,
        unread: m.direction === "in" && !m.readAt ? 1 : 0,
        count: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, limit);
}

export function threadMessages(data: AppData, key: string): Message[] {
  const [channel, address] = key.split(/:(.+)/) as ["sms" | "email", string];
  return data.messages
    .filter((m) => {
      const ch: "sms" | "email" = m.channel === "email" ? "email" : "sms";
      if (ch !== channel) return false;
      const other = m.direction === "in" ? m.from : m.to;
      return normalizeAddress(channel, other) === address;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function markThreadRead(data: AppData, key: string, ctx: Ctx): number {
  let n = 0;
  for (const m of threadMessages(data, key)) {
    if (m.direction === "in" && !m.readAt) {
      m.readAt = ctx.nowIso();
      n += 1;
    }
  }
  return n;
}

/** Claude drafts the next reply from lead context + thread. Falls back to a plain template. */
export async function draftThreadReply(data: AppData, key: string, opts: { instruction?: string; ai?: boolean } = {}): Promise<{ text: string; by: "ai" | "local" }> {
  const msgs = threadMessages(data, key).slice(-12);
  const [channel] = key.split(":") as ["sms" | "email"];
  const last = [...msgs].reverse().find((m) => m.direction === "in");
  const lead = last?.leadId ? data.leads.find((l) => l.id === last.leadId) : msgs.find((m) => m.leadId) ? data.leads.find((l) => l.id === msgs.find((m) => m.leadId)!.leadId) : undefined;
  const job = lead ? data.jobs.find((j) => j.leadId === lead.id) : undefined;
  const p = companyProfile();
  const first = (lead?.name ?? "").split(/\s+/)[0] || "there";
  const local = channel === "sms"
    ? `Hi ${first}, ${p.signer} from ${p.shortName} here. Thanks for the message — happy to help. What day works for a quick look at the job? I can come by and give you a written quote on the spot.`
    : `Hi ${first},\n\nThanks for getting back to me. Happy to help — what day works for a quick site visit? I'll bring a written quote.\n\n${p.signer}\n${p.name} · ${[p.phone, p.email].filter(Boolean).join(" · ")}`;
  if (opts.ai === false) return { text: local, by: "local" };
  const transcript = msgs.map((m) => `${m.direction === "in" ? (lead?.name ?? "Customer") : p.signer}: ${m.transcription ?? m.body}`).join("\n");
  try {
    const res = await completeChat({
      system: `You are ${p.signer}, owner of ${p.name}, a Nova Scotia exterior contractor (${p.services}). Write the next ${channel === "sms" ? "text message (under 300 characters, no greeting fluff, no emojis)" : "short email reply (under 120 words, plain text, sign off with the signature block provided)"} to a customer. Be warm, direct, and move toward a concrete next step (site visit day/time, confirming details, answering their question). Never invent prices or dates that are not in the context. Output only the message text.`,
      user: `Customer: ${lead ? `${lead.name} · ${lead.status} · ${lead.jobType} · ${lead.city} · notes: ${lead.notes.slice(0, 300)}` : "unknown"}\n${job ? `Job: ${job.title} · ${job.status} · start ${job.startDate}\n` : ""}${opts.instruction ? `Owner instruction: ${opts.instruction}\n` : ""}Signature block: ${p.signer}\n${p.name} · ${[p.phone, p.email].filter(Boolean).join(" · ")}\n\nConversation so far:\n${transcript || "(none)"}\n\nWrite the reply.`,
      temperature: 0.5,
      tier: "main",
      maxTokens: 500,
    });
    if (!res?.text) return { text: local, by: "local" };
    let text = res.text.trim();
    if (channel === "sms" && text.length > 320) text = text.slice(0, 300).replace(/\s+\S*$/, "") + "…";
    return { text, by: "ai" };
  } catch {
    return { text: local, by: "local" };
  }
}

export function canMessage(data: AppData, channel: "sms" | "email", address: string): { ok: boolean; reason?: string } {
  if (!address) return { ok: false, reason: `no ${channel === "sms" ? "phone number" : "email"}` };
  if (isOptedOut(data, channel, address)) return { ok: false, reason: "opted out" };
  return { ok: true };
}
