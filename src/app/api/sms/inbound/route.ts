import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { handleInboundReply } from "@/lib/outreach-send";
import { newId, nowIso, updateStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Twilio "A message comes in" webhook.
 *
 * Twilio console → Phone Numbers → your number → Messaging → A message comes in:
 *   Webhook  https://bhcontracting.ca/api/sms/inbound   HTTP POST
 * (or on the Messaging Service → Integration → Send a webhook)
 *
 * Validates X-Twilio-Signature with TWILIO_AUTH_TOKEN. If the app sits behind
 * a proxy that rewrites the URL, set TWILIO_INBOUND_URL to the exact public URL.
 * STOP / UNSUBSCRIBE → opt-out (Twilio also enforces this at the carrier level);
 * anything else → marks the ad/lead as replied and alerts the assignee.
 */

function twilioSignatureValid(url: string, params: Record<string, string>, header: string | null, token: string): boolean {
  if (!header) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", token).update(data).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

function twiml(message?: string): NextResponse {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message.replace(/[<&>]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/xml" } });
}

export async function POST(request: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!token) return NextResponse.json({ error: "TWILIO_AUTH_TOKEN not set" }, { status: 503 });

  const fd = await request.formData().catch(() => null);
  if (!fd) return NextResponse.json({ error: "form body expected" }, { status: 400 });
  const params: Record<string, string> = {};
  for (const [k, v] of fd.entries()) params[k] = typeof v === "string" ? v : "";

  const publicUrl = process.env.TWILIO_INBOUND_URL?.trim() || request.url;
  const skipValidation = process.env.TWILIO_SKIP_SIGNATURE === "1" && process.env.NODE_ENV !== "production";
  if (!skipValidation && !twilioSignatureValid(publicUrl, params, request.headers.get("x-twilio-signature"), token)) {
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 403 });
  }

  const from = params.From ?? "";
  const body = params.Body ?? "";
  if (!from) return twiml();

  let outcome: ReturnType<typeof handleInboundReply> | null = null;
  await updateStore((d) => {
    outcome = handleInboundReply(d, { channel: "sms", from, body, messageId: params.MessageSid }, { newId, nowIso });
  });

  const o = outcome as ReturnType<typeof handleInboundReply> | null;
  if (o?.optedOut) {
    // Twilio's own STOP handling already replies for standard keywords; only answer soft opt-outs.
    return /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\b/i.test(body) ? twiml() : twiml("Understood — we won't message you again. Thanks!");
  }
  return twiml();
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    enabled: Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()),
    configure: "Twilio → your number → Messaging → 'A message comes in' → POST this URL",
  });
}
