import { NextResponse } from "next/server";
import { ensureBuiltinSource, ingestRawAds, parseAlertEmail, type RawAd } from "@/lib/ad-ingest";
import { imapConfigured, pollImapInbox } from "@/lib/ad-imap";
import { qualifyListing } from "@/lib/ad-pipeline";
import { newId, nowIso, updateStoreAsync } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Push endpoint for ads. Works with:
 *   - Zapier / Make "Email Parser" or "New email" → Webhooks POST (JSON)
 *   - Cloudflare Email Workers, Mailgun Routes, SendGrid Inbound Parse (form fields)
 *   - your own scripts: POST { title, body, url, contactEmail, contactPhone }
 *
 * Auth: header `x-bhc-inbound-secret` or `?secret=` must equal ADS_INBOUND_SECRET.
 * Each ad is deduped, triaged, and (if it qualifies) turned into a lead + drafts.
 */

function pick(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (ct.includes("form")) {
    const fd = await request.formData().catch(() => null);
    const out: Record<string, unknown> = {};
    if (fd) for (const [k, v] of fd.entries()) out[k] = typeof v === "string" ? v : "";
    return out;
  }
  const text = await request.text().catch(() => "");
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { text };
  }
}

export async function POST(request: Request) {
  const secret = process.env.ADS_INBOUND_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Inbound ads disabled — set ADS_INBOUND_SECRET on the server." }, { status: 503 });
  }
  const url = new URL(request.url);
  const given = request.headers.get("x-bhc-inbound-secret")?.trim() || url.searchParams.get("secret")?.trim();
  if (given !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readBody(request);

  // Shape 1: explicit ad
  let raws: RawAd[] = [];
  const explicitTitle = pick(body, ["title", "adTitle", "listingTitle"]);
  const explicitBody = pick(body, ["body", "description", "adBody"]);
  if (explicitTitle && !pick(body, ["subject", "html", "text-plain", "body-plain", "TextBody", "HtmlBody"])) {
    raws = [
      {
        title: explicitTitle,
        body: explicitBody,
        url: pick(body, ["url", "link", "adUrl"]),
        location: pick(body, ["location", "city", "area"]),
        contactName: pick(body, ["contactName", "name", "poster"]),
        contactEmail: pick(body, ["contactEmail", "email"]),
        contactPhone: pick(body, ["contactPhone", "phone"]),
        externalId: pick(body, ["externalId", "id"]) || undefined,
        postedAt: pick(body, ["postedAt", "date"]) || nowIso(),
      },
    ];
  } else {
    // Shape 2: a forwarded email (Zapier / Cloudflare / Mailgun / SendGrid / Postmark field names)
    raws = parseAlertEmail({
      subject: pick(body, ["subject", "Subject"]),
      text: pick(body, ["text", "text-plain", "body-plain", "TextBody", "plain", "stripped-text"]) || undefined,
      html: pick(body, ["html", "body-html", "HtmlBody", "stripped-html"]) || undefined,
      from: pick(body, ["from", "From", "sender"]),
      messageId: pick(body, ["messageId", "Message-Id", "message-id", "MessageID"]) || undefined,
      receivedAt: nowIso(),
    });
  }

  let created = 0;
  let qualified = 0;
  await updateStoreAsync(async (d) => {
    const src = ensureBuiltinSource(d, "webhook", { newId, nowIso });
    const items = ingestRawAds(d, src, raws, { newId, nowIso });
    created = items.length;
    for (const ad of items.slice(0, 10)) {
      const r = await qualifyListing(d, ad, {
        newId,
        nowIso,
        pollImap: imapConfigured() ? pollImapInbox : undefined,
      });
      if (r.qualified) qualified += 1;
    }
  });

  return NextResponse.json({ ok: true, received: raws.length, created, qualified });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    enabled: Boolean(process.env.ADS_INBOUND_SECRET?.trim()),
    usage: "POST JSON {title, body, url, contactEmail, contactPhone} or a forwarded email {subject, text|html, from}. Auth: x-bhc-inbound-secret header or ?secret=.",
  });
}
