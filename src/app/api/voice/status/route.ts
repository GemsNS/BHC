import { NextResponse } from "next/server";
import { companyProfile } from "@/lib/ad-classify";
import { live } from "@/lib/events";
import { findLeadByAddress, recordMessage } from "@/lib/messaging";
import { enqueueNotification } from "@/lib/notifications";
import { isOptedOut } from "@/lib/outreach-send";
import { sendSms, smsConfigStatus, toE164, twilioEnabled } from "@/lib/sms";
import { newId, nowIso, updateStoreAsync } from "@/lib/store";
import { readTwilioForm, twilioPublicUrl, twilioSignatureValid, twiml, xmlEscape } from "@/lib/twilio-verify";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Called by Twilio after the <Dial> (or after a voicemail <Record> with ?vm=1).
 * Missed / busy / no-answer → voicemail prompt + missed-call text-back + lead/task.
 */
export async function POST(request: Request) {
  if (!twilioEnabled()) {
    return NextResponse.json(
      { error: "Voice pending Twilio compliance approval (TWILIO_ENABLED=0)." },
      { status: 503 },
    );
  }
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!token) return NextResponse.json({ error: "TWILIO_AUTH_TOKEN not set" }, { status: 503 });
  const params = await readTwilioForm(request);
  const url = new URL(request.url);
  const path = `/api/voice/status${url.search}`;
  const skip = process.env.TWILIO_SKIP_SIGNATURE === "1" && process.env.NODE_ENV !== "production";
  if (!skip && !twilioSignatureValid(twilioPublicUrl(request, path), params, request.headers.get("x-twilio-signature"), token)) {
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
  }
  const from = params.From ?? "";
  const afterVoicemail = url.searchParams.get("vm") === "1";
  const dialStatus = params.DialCallStatus ?? "";
  const answered = dialStatus === "completed";
  const p = companyProfile();
  const base = (process.env.TWILIO_PUBLIC_BASE ?? process.env.APP_BASE_URL ?? "https://bhcontracting.ca").replace(/\/$/, "");

  if (afterVoicemail) {
    return twiml(`<Say voice="Polly.Joanna">Thanks. We'll call you back shortly. Goodbye.</Say>`);
  }
  if (answered) {
    await updateStoreAsync(async (d) => {
      const lead = findLeadByAddress(d, "sms", from) ?? null;
      recordMessage(d, { channel: "voice", direction: "in", from, to: params.To ?? "", subject: "Call answered", body: `Call answered (${params.DialCallDuration ?? "?"}s)`, leadId: lead?.id ?? null, jobId: null, adId: null, provider: "twilio", providerId: params.CallSid ?? null, status: "received", recordingUrl: null, transcription: null, durationSec: Number(params.DialCallDuration ?? 0) || null }, { newId, nowIso });
      live.call(`Call from ${lead?.name ?? from} answered`, `${params.DialCallDuration ?? "?"}s`, { leadId: lead?.id });
    });
    return twiml();
  }

  // Missed call
  await updateStoreAsync(async (d) => {
    let lead: Lead | null = findLeadByAddress(d, "sms", from) ?? null;
    let created = false;
    if (!lead && from) {
      const stamp = nowIso();
      lead = { id: newId(), name: `Caller ${toE164(from) ?? from}`, phone: toE164(from) ?? from, email: "", address: "TBD", city: "", source: "Missed call", status: "new", jobType: "residential", notes: "Missed call — see inbox for voicemail.", assignedToId: null, companyId: null, leadScore: 65, createdAt: stamp, updatedAt: stamp };
      d.leads.unshift(lead);
      created = true;
    }
    const stamp = nowIso();
    recordMessage(d, { channel: "voice", direction: "in", from, to: params.To ?? "", subject: "Missed call", body: `Missed call (${dialStatus || "no answer"})`, leadId: lead?.id ?? null, jobId: null, adId: null, provider: "twilio", providerId: params.CallSid ?? null, status: "received", recordingUrl: null, transcription: null, durationSec: null }, { newId, nowIso });
    if (lead) {
      d.activities.unshift({ id: newId(), type: "call", subject: `Missed call from ${lead.name}`, body: "Call back", relatedType: "lead", relatedId: lead.id, authorId: lead.assignedToId ?? "emp-admin", dueAt: stamp, completedAt: null, createdAt: stamp });
      enqueueNotification(d, { employeeId: lead.assignedToId, title: `Missed call from ${lead.name}`, body: created ? "New number — text-back sent, voicemail may follow." : "Text-back sent, voicemail may follow.", href: "/admin/inbox", dedupeKey: `missed:${params.CallSid ?? from}` }, newId, nowIso);
    }
    live.call(`Missed call from ${lead?.name ?? from}`, created ? "new lead created" : undefined, { leadId: lead?.id });

    // Missed-call text-back
    const textback = (process.env.MISSED_CALL_TEXTBACK ?? "1") !== "0" && smsConfigStatus().configured && from && !isOptedOut(d, "sms", from);
    if (textback) {
      const body = process.env.MISSED_CALL_TEXT?.trim() || `Hi, it's ${p.signer} at ${p.shortName} — sorry I missed your call. Text me here with what you need done (siding, deck, windows, soffit…) and your address, and I'll get right back to you. Reply STOP to opt out.`;
      const r = await sendSms({ to: from, body });
      recordMessage(d, { channel: "sms", direction: "out", from: smsConfigStatus().from ?? "", to: from, subject: "", body, leadId: lead?.id ?? null, jobId: null, adId: null, provider: r.provider, providerId: r.id, status: r.ok ? "sent" : "failed", recordingUrl: null, transcription: null, durationSec: null }, { newId, nowIso });
      live.outreach(`Missed-call text-back to ${lead?.name ?? from}`, r.ok ? "sent" : `failed: ${r.error}`, { leadId: lead?.id }, r.ok ? "success" : "error");
    }
  });

  const greeting = process.env.VOICE_GREETING?.trim() || `Sorry we missed you. This is ${p.name.replace(/\.$/, "")}. Please leave your name, address and what you need done after the tone, and we'll call you back today.`;
  return twiml(`<Say voice="Polly.Joanna">${xmlEscape(greeting)}</Say><Record maxLength="120" transcribe="true" transcribeCallback="${base}/api/voice/voicemail" action="${base}/api/voice/status?vm=1" playBeep="true" />`);
}
