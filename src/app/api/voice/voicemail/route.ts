import { NextResponse } from "next/server";
import { completeChat } from "@/lib/ai-provider";
import { live } from "@/lib/events";
import { findLeadByAddress, recordMessage } from "@/lib/messaging";
import { enqueueNotification } from "@/lib/notifications";
import { newId, nowIso, updateStoreAsync } from "@/lib/store";
import { readTwilioForm, twilioPublicUrl, twilioSignatureValid } from "@/lib/twilio-verify";

export const dynamic = "force-dynamic";

/**
 * Twilio transcription callback (transcribeCallback on <Record>). Stores the
 * voicemail + transcript, asks Claude for a one-line summary, and files a task.
 */
export async function POST(request: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!token) return NextResponse.json({ error: "TWILIO_AUTH_TOKEN not set" }, { status: 503 });
  const params = await readTwilioForm(request);
  const skip = process.env.TWILIO_SKIP_SIGNATURE === "1" && process.env.NODE_ENV !== "production";
  if (!skip && !twilioSignatureValid(twilioPublicUrl(request, "/api/voice/voicemail"), params, request.headers.get("x-twilio-signature"), token)) {
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
  }
  const from = params.From ?? "";
  const text = (params.TranscriptionText ?? "").trim();
  const recordingUrl = params.RecordingUrl ? `${params.RecordingUrl}.mp3` : null;
  const duration = Number(params.RecordingDuration ?? 0) || null;

  let summary = text.slice(0, 160);
  if (text.length > 40) {
    const ai = await completeChat({ system: "Summarize this voicemail to an exterior contractor in one sentence: who, what work, where, urgency, and any phone/address mentioned. Output only the sentence.", user: text, tier: "fast", maxTokens: 120, temperature: 0 }).catch(() => null);
    if (ai?.text) summary = ai.text.trim().slice(0, 240);
  }

  await updateStoreAsync(async (d) => {
    const lead = findLeadByAddress(d, "sms", from) ?? null;
    if (lead && lead.notes.startsWith("Missed call")) lead.notes = `Voicemail: ${summary}`;
    recordMessage(d, { channel: "voice", direction: "in", from, to: params.To ?? "", subject: "Voicemail", body: summary, leadId: lead?.id ?? null, jobId: null, adId: null, provider: "twilio", providerId: params.CallSid ?? params.RecordingSid ?? null, status: "received", recordingUrl, transcription: text || null, durationSec: duration }, { newId, nowIso });
    const stamp = nowIso();
    if (lead) {
      d.activities.unshift({ id: newId(), type: "call", subject: `Voicemail from ${lead.name}`, body: summary, relatedType: "lead", relatedId: lead.id, authorId: lead.assignedToId ?? "emp-admin", dueAt: stamp, completedAt: null, createdAt: stamp });
    }
    enqueueNotification(d, { employeeId: lead?.assignedToId ?? null, title: `Voicemail from ${lead?.name ?? from}`, body: summary, href: "/admin/inbox", dedupeKey: `vm:${params.RecordingSid ?? params.CallSid ?? stamp}` }, newId, nowIso);
    live.call(`Voicemail from ${lead?.name ?? from}`, summary, { leadId: lead?.id });
  });
  return NextResponse.json({ ok: true });
}
