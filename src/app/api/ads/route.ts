import { NextResponse } from "next/server";
import { z } from "zod";
import { imapConfigured, imapSummary, pollImapInbox } from "@/lib/ad-imap";
import { ensureBuiltinSource, ensureImapAdSource, ingestRawAds, newAdSource, parseFeed } from "@/lib/ad-ingest";
import { adMinScore, qualifyListing, runAdIngest } from "@/lib/ad-pipeline";
import { classifyAd, companyProfile, draftReply } from "@/lib/ad-classify";
import { getAIStatus } from "@/lib/ai-provider";
import { requireApiEmployee } from "@/lib/api-auth";
import { mailConfigStatus, sendEmail } from "@/lib/mail";
import { markAdReplied, processOutreachQueue, sendPolicy } from "@/lib/outreach-send";
import { serverSenders } from "@/lib/server-senders";
import { sendSms, smsConfigStatus } from "@/lib/sms";
import { newId, nowIso, readStore, updateStore, updateStoreAsync } from "@/lib/store";
import type { AdListing, OutreachQueueItem } from "@/lib/types";

const hooks = () => ({
  newId,
  nowIso,
  pollImap: imapConfigured() ? pollImapInbox : undefined,
});

function setupStatus() {
  const ai = getAIStatus();
  const mail = mailConfigStatus();
  const sms = smsConfigStatus();
  const policy = sendPolicy();
  return {
    ai: { configured: ai.configured, provider: ai.provider, model: ai.model },
    email: { configured: mail.configured, provider: mail.provider, from: mail.from },
    sms: { configured: sms.configured, provider: sms.provider, from: sms.from },
    imap: imapSummary(),
    inboundWebhook: Boolean(process.env.ADS_INBOUND_SECRET?.trim()),
    autosend: [...policy.autosend],
    autosendMinScore: policy.autosendMinScore,
    dailyCap: policy.dailyCap,
    quietHours: `${policy.quietStart}-${policy.quietEnd}`,
    followUpDays: policy.followUpDays,
    minScore: adMinScore(),
    company: companyProfile(),
  };
}

export async function GET(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  if (imapConfigured()) {
    await updateStore((d) => {
      ensureImapAdSource(d, { newId, nowIso });
    });
  }
  const data = await readStore();
  const listings = [...data.adListings].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt)).slice(0, 300);
  const adIds = new Set(listings.map((l) => l.id));
  return NextResponse.json({
    sources: data.adSources,
    listings,
    outreach: data.outreachQueue.filter((o) => o.adId && adIds.has(o.adId)),
    setup: setupStatus(),
    stats: {
      total: data.adListings.length,
      new: data.adListings.filter((a) => a.status === "new").length,
      drafted: data.adListings.filter((a) => a.status === "drafted" || a.status === "qualified").length,
      sent: data.adListings.filter((a) => a.status === "sent").length,
      replied: data.adListings.filter((a) => a.status === "replied" || a.status === "won").length,
      pendingApproval: data.outreachQueue.filter((o) => o.adId && o.status === "pending_approval").length,
    },
  });
}

const sourceSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  type: z.enum(["rss", "imap", "webhook", "manual"]),
  url: z.string().optional(),
  enabled: z.boolean().optional(),
  keywords: z.array(z.string()).optional(),
  excludeKeywords: z.array(z.string()).optional(),
  region: z.string().optional(),
});

const bodySchema = z.object({
  action: z.enum([
    "add_source",
    "update_source",
    "remove_source",
    "ingest",
    "add_manual",
    "requalify",
    "redraft",
    "skip",
    "restore",
    "mark_replied",
    "set_status",
    "update_outreach",
    "approve",
    "send",
    "cancel",
    "send_test",
  ]),
  id: z.string().optional(),
  source: sourceSchema.optional(),
  ad: z
    .object({
      title: z.string().min(1),
      body: z.string().optional(),
      url: z.string().optional(),
      location: z.string().optional(),
      contactName: z.string().optional(),
      contactEmail: z.string().optional(),
      contactPhone: z.string().optional(),
    })
    .optional(),
  status: z.string().optional(),
  outreach: z.object({ subject: z.string().optional(), message: z.string().optional() }).optional(),
  channel: z.enum(["email", "sms"]).optional(),
  to: z.string().optional(),
  force: z.boolean().optional(),
});

export async function POST(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;

  switch (body.action) {
    case "add_source": {
      if (!body.source) return NextResponse.json({ error: "source required" }, { status: 400 });
      const src = newAdSource(body.source, { newId, nowIso });
      const data = await updateStore((d) => {
        d.adSources.push(src);
      });
      return NextResponse.json({ ok: true, source: src, sources: data.adSources }, { status: 201 });
    }
    case "update_source": {
      if (!body.id || !body.source) return NextResponse.json({ error: "id + source required" }, { status: 400 });
      const data = await updateStore((d) => {
        const s = d.adSources.find((x) => x.id === body.id);
        if (!s) return;
        Object.assign(s, {
          name: body.source!.name,
          type: body.source!.type,
          url: body.source!.url ?? s.url,
          enabled: body.source!.enabled ?? s.enabled,
          keywords: body.source!.keywords ?? s.keywords,
          excludeKeywords: body.source!.excludeKeywords ?? s.excludeKeywords,
          region: body.source!.region ?? s.region,
        });
      });
      return NextResponse.json({ ok: true, sources: data.adSources });
    }
    case "remove_source": {
      const data = await updateStore((d) => {
        d.adSources = d.adSources.filter((s) => s.id !== body.id);
      });
      return NextResponse.json({ ok: true, sources: data.adSources });
    }
    case "ingest": {
      let result: Awaited<ReturnType<typeof runAdIngest>> | null = null;
      await updateStoreAsync(async (d) => {
        result = await runAdIngest(d, hooks());
      });
      return NextResponse.json({ ok: true, result });
    }
    case "add_manual": {
      if (!body.ad) return NextResponse.json({ error: "ad required" }, { status: 400 });
      let created: AdListing[] = [];
      let qualified = false;
      await updateStoreAsync(async (d) => {
        const src = ensureBuiltinSource(d, "manual", { newId, nowIso });
        created = ingestRawAds(
          d,
          src,
          [
            {
              title: body.ad!.title,
              body: body.ad!.body ?? "",
              url: body.ad!.url,
              location: body.ad!.location,
              contactName: body.ad!.contactName,
              contactEmail: body.ad!.contactEmail,
              contactPhone: body.ad!.contactPhone,
              postedAt: nowIso(),
            },
          ],
          { newId, nowIso },
        );
        if (created[0]) {
          const r = await qualifyListing(d, created[0], hooks(), { force: Boolean(body.force) });
          qualified = r.qualified;
        }
      });
      if (!created.length) return NextResponse.json({ error: "Duplicate of an existing ad" }, { status: 409 });
      return NextResponse.json({ ok: true, ad: created[0], qualified }, { status: 201 });
    }
    case "requalify":
    case "redraft": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      let ad: AdListing | undefined;
      let drafts: OutreachQueueItem[] = [];
      await updateStoreAsync(async (d) => {
        ad = d.adListings.find((a) => a.id === body.id);
        if (!ad) return;
        if (body.action === "redraft") {
          // Drop unsent first-contact drafts so the new ones replace them
          const drop = new Set(
            d.outreachQueue.filter((o) => o.adId === ad!.id && !o.followUpOf && (o.status === "pending_approval" || o.status === "approved" || o.status === "failed")).map((o) => o.id),
          );
          d.outreachQueue = d.outreachQueue.filter((o) => !drop.has(o.id));
          ad.outreachIds = ad.outreachIds.filter((id) => !drop.has(id));
          const draft = await draftReply(ad, {});
          void classifyAd; // keep classification as-is on redraft
          const r = await qualifyListing(d, ad, hooks(), { force: true });
          drafts = r.drafts;
          if (!drafts.length) {
            ad.notes = `${ad.notes}\nRedraft produced no new drafts (${draft.by}).`.trim();
          }
        } else {
          ad.status = "new";
          const r = await qualifyListing(d, ad, hooks(), { force: Boolean(body.force) });
          drafts = r.drafts;
        }
      });
      if (!ad) return NextResponse.json({ error: "Ad not found" }, { status: 404 });
      return NextResponse.json({ ok: true, ad, drafts });
    }
    case "skip":
    case "restore":
    case "set_status": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const status =
        body.action === "skip" ? "skipped" : body.action === "restore" ? "new" : (body.status as AdListing["status"] | undefined);
      if (!status) return NextResponse.json({ error: "status required" }, { status: 400 });
      let found = false;
      await updateStore((d) => {
        const ad = d.adListings.find((a) => a.id === body.id);
        if (!ad) return;
        found = true;
        ad.status = status;
        if (status === "skipped" || status === "lost") {
          for (const o of d.outreachQueue) {
            if (o.adId === ad.id && (o.status === "pending_approval" || o.status === "approved")) o.status = "cancelled";
          }
        }
        if (status === "won" && ad.leadId) {
          const lead = d.leads.find((l) => l.id === ad.leadId);
          if (lead) {
            lead.status = "won";
            lead.updatedAt = nowIso();
          }
        }
      });
      if (!found) return NextResponse.json({ error: "Ad not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    case "mark_replied": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      let ok = false;
      await updateStore((d) => {
        ok = markAdReplied(d, body.id!, { newId, nowIso });
      });
      return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Ad not found" }, { status: 404 });
    }
    case "update_outreach": {
      if (!body.id || !body.outreach) return NextResponse.json({ error: "id + outreach required" }, { status: 400 });
      let item: OutreachQueueItem | undefined;
      await updateStore((d) => {
        item = d.outreachQueue.find((o) => o.id === body.id);
        if (!item) return;
        if (body.outreach!.subject != null) item.subject = body.outreach!.subject;
        if (body.outreach!.message != null) item.message = body.outreach!.message;
      });
      return item ? NextResponse.json({ ok: true, item }) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    case "approve":
    case "cancel": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      let item: OutreachQueueItem | undefined;
      await updateStore((d) => {
        item = d.outreachQueue.find((o) => o.id === body.id);
        if (!item) return;
        item.status = body.action === "approve" ? "approved" : "cancelled";
        if (item.status === "approved") item.error = null;
      });
      return item ? NextResponse.json({ ok: true, item }) : NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    case "send": {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      let item: OutreachQueueItem | undefined;
      let result: Awaited<ReturnType<typeof processOutreachQueue>> | null = null;
      await updateStoreAsync(async (d) => {
        item = d.outreachQueue.find((o) => o.id === body.id);
        if (!item) return;
        if (item.channel === "platform" || item.channel === "call") {
          // Manual channel: operator pasted it on the platform — record as sent
          item.status = "sent";
          item.sentAt = nowIso();
          item.provider = "manual";
          const ad = d.adListings.find((a) => a.id === item!.adId);
          if (ad && (ad.status === "drafted" || ad.status === "qualified")) ad.status = "sent";
          return;
        }
        item.status = "approved";
        // Send only this item: temporarily isolate it
        const others = d.outreachQueue.filter((o) => o.id !== item!.id && o.status === "approved");
        for (const o of others) o.status = "queued";
        const policy = sendPolicy();
        result = await processOutreachQueue(d, { newId, nowIso }, serverSenders(), {
          ...policy,
          quietStart: 0,
          quietEnd: 0, // operator clicked Send — bypass quiet hours
        });
        for (const o of others) o.status = "approved";
      });
      if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: item.status === "sent", item, result });
    }
    case "send_test": {
      if (!body.channel || !body.to) return NextResponse.json({ error: "channel + to required" }, { status: 400 });
      const profile = companyProfile();
      if (body.channel === "sms") {
        const r = await sendSms({ to: body.to, body: `Test from ${profile.shortName} CRM — SMS outreach is connected. Reply STOP to opt out.` });
        return NextResponse.json(r, { status: r.ok ? 200 : 502 });
      }
      const r = await sendEmail({
        to: body.to,
        subject: `Test — ${profile.name} CRM outreach`,
        text: `This is a test message from the ${profile.name} CRM. Email outreach is connected.\n\n${profile.signer}\n${profile.name}`,
      });
      return NextResponse.json(r, { status: r.ok ? 200 : 502 });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}

/** Preview: parse an RSS URL without saving (used by the source form). */
export async function PUT(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const { url } = z.object({ url: z.string().url() }).parse(await request.json());
  try {
    const res = await fetch(url, { headers: { "User-Agent": "BHC-CRM/1.0" } });
    if (!res.ok) return NextResponse.json({ error: `HTTP ${res.status}` }, { status: 502 });
    const items = parseFeed(await res.text());
    return NextResponse.json({ ok: true, count: items.length, sample: items.slice(0, 5) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "fetch failed" }, { status: 502 });
  }
}
