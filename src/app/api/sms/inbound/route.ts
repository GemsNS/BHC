import { NextResponse } from "next/server";
import { receiveInbound } from "@/lib/messaging";
import { twilioEnabled } from "@/lib/sms";
import { newId, nowIso, updateStore } from "@/lib/store";
import { readTwilioForm, twilioPublicUrl, twilioSignatureValid, twiml, xmlEscape } from "@/lib/twilio-verify";

export const dynamic = "force-dynamic";

/**
 * Twilio "A message comes in" webhook.
 *
 * Twilio console → Phone Numbers → your number → Messaging → A message comes in:
 *   Webhook  https://bhcontracting.ca/api/sms/inbound   HTTP POST
 *
 * STOP / UNSUBSCRIBE → opt-out. Replies from prospects mark the ad/lead as
 * replied. Unknown numbers become a lead ("Inbound text") so nothing is lost.
 * Every message lands in /admin/inbox.
 */
export async function POST(request: Request) {
  if (!twilioEnabled()) {
    return NextResponse.json(
      { error: "SMS pending Twilio compliance approval (TWILIO_ENABLED=0)." },
      { status: 503 },
    );
  }
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!token) return NextResponse.json({ error: "TWILIO_AUTH_TOKEN not set" }, { status: 503 });
  const params = await readTwilioForm(request);
  const skip = process.env.TWILIO_SKIP_SIGNATURE === "1" && process.env.NODE_ENV !== "production";
  if (!skip && !twilioSignatureValid(twilioPublicUrl(request, "/api/sms/inbound"), params, request.headers.get("x-twilio-signature"), token)) {
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
  }
  const from = params.From ?? "";
  const body = params.Body ?? "";
  if (!from) return twiml();

  let optedOut = false;
  let soft = false;
  await updateStore((d) => {
    const r = receiveInbound(d, { channel: "sms", from, body, providerId: params.MessageSid ?? null, provider: "twilio" }, { newId, nowIso });
    optedOut = r.optedOut;
    soft = optedOut && !/^\s*(stop|stopall|unsubscribe|cancel|end|quit)\b/i.test(body);
  });
  if (optedOut && soft) return twiml(`<Message>${xmlEscape("Understood — we won't message you again. Thanks!")}</Message>`);
  return twiml();
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    enabled: Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()),
    configure: "Twilio → your number → Messaging → 'A message comes in' → POST this URL",
  });
}
