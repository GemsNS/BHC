import { NextResponse } from "next/server";
import { companyProfile } from "@/lib/ad-classify";
import { live } from "@/lib/events";
import { twilioEnabled } from "@/lib/sms";
import { readTwilioForm, twilioPublicUrl, twilioSignatureValid, twiml, xmlEscape } from "@/lib/twilio-verify";

export const dynamic = "force-dynamic";

/**
 * Twilio Voice "A call comes in" webhook.
 *   Twilio → your number → Voice → A call comes in → https://bhcontracting.ca/api/voice/inbound (POST)
 *
 * Disabled while TWILIO_ENABLED=0 (compliance hold).
 *
 * Rings VOICE_FORWARD_TO (your cell) for VOICE_RING_SECONDS; if nobody answers,
 * /api/voice/status takes over: voicemail + transcription + missed-call text-back.
 *
 * Env: VOICE_FORWARD_TO=+1902…  VOICE_RING_SECONDS=20  VOICE_GREETING="…"
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
  const skip = process.env.TWILIO_SKIP_SIGNATURE === "1" && process.env.NODE_ENV !== "production";
  if (!skip && !twilioSignatureValid(twilioPublicUrl(request, "/api/voice/inbound"), params, request.headers.get("x-twilio-signature"), token)) {
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
  }
  const forward = process.env.VOICE_FORWARD_TO?.trim();
  const ring = Math.max(10, Number(process.env.VOICE_RING_SECONDS ?? "20") || 20);
  const p = companyProfile();
  const base = (process.env.TWILIO_PUBLIC_BASE ?? process.env.APP_BASE_URL ?? "https://bhcontracting.ca").replace(/\/$/, "");
  live.call(`Incoming call from ${params.From ?? "unknown"}`, forward ? `ringing ${forward}` : "no VOICE_FORWARD_TO — straight to voicemail");
  if (!forward) {
    return twiml(`<Say voice="Polly.Joanna">${xmlEscape(process.env.VOICE_GREETING?.trim() || `Thanks for calling ${p.name.replace(/\.$/, "")}. Please leave your name, number and what you need done, and we'll call you right back.`)}</Say><Record maxLength="120" transcribe="true" transcribeCallback="${base}/api/voice/voicemail" action="${base}/api/voice/status?vm=1" playBeep="true" />`);
  }
  return twiml(`<Dial timeout="${ring}" action="${base}/api/voice/status" callerId="${xmlEscape(params.To ?? "")}"><Number>${xmlEscape(forward)}</Number></Dial>`);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    enabled: twilioEnabled() && Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()),
    pendingApproval: !twilioEnabled(),
    forwardTo: process.env.VOICE_FORWARD_TO ? "set" : "not set",
    configure: "Twilio → your number → Voice → 'A call comes in' → POST this URL",
  });
}
