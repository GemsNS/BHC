import { createHmac, timingSafeEqual } from "crypto";

/** Validate X-Twilio-Signature for a form-encoded webhook (HMAC-SHA1 of URL + sorted params). */
export function twilioSignatureValid(url: string, params: Record<string, string>, header: string | null, token: string): boolean {
  if (!header) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", token).update(data).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Public URL Twilio signed against (proxies may rewrite host/scheme). */
export function twilioPublicUrl(request: Request, path: string): string {
  const base = process.env.TWILIO_PUBLIC_BASE?.trim() || process.env.APP_BASE_URL?.trim();
  if (base) return `${base.replace(/\/$/, "")}${path}`;
  return request.url;
}

export async function readTwilioForm(request: Request): Promise<Record<string, string>> {
  const fd = await request.formData().catch(() => null);
  const params: Record<string, string> = {};
  if (fd) for (const [k, v] of fd.entries()) params[k] = typeof v === "string" ? v : "";
  return params;
}

export function twiml(inner = ""): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { status: 200, headers: { "Content-Type": "text/xml" } });
}

export function xmlEscape(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
}
