import { NextResponse } from "next/server";
import { mailConfigStatus, sendContactEmail } from "@/lib/mail";
import {
  checkRateLimit,
  clientIp,
  envInt,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { verifyCaptchaToken } from "@/lib/captcha";

const LIMITS = { name: 120, email: 254, phone: 40, details: 4000 } as const;

/** Lets static sites (e.g. GitHub Pages) POST to this route hosted elsewhere. */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status: number, extraHeaders?: Record<string, string>) {
  return NextResponse.json(data, {
    status,
    headers: { ...corsHeaders, ...(extraHeaders || {}) },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function GET() {
  const status = mailConfigStatus();
  return json(
    {
      ok: true,
      configured: status.configured,
      provider: status.provider,
    },
    200,
  );
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = checkRateLimit({
    key: `contact:${ip}`,
    limit: envInt("CONTACT_RATE_PER_HOUR", 8),
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return json(
      { error: "Too many messages from this network. Please try later." },
      429,
      rateLimitHeaders(rl),
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return json({ error: "Invalid payload" }, 400);
  }

  const { name, email, phone, details, quoteType, captchaToken, website } = body as Record<
    string,
    unknown
  >;

  // Honeypot — bots fill hidden "website" fields
  if (typeof website === "string" && website.trim()) {
    return json({ ok: true }, 200, rateLimitHeaders(rl));
  }

  const captcha = await verifyCaptchaToken({
    token: typeof captchaToken === "string" ? captchaToken : undefined,
    ip,
  });
  if (!captcha.ok) {
    return json({ error: captcha.error || "Captcha required." }, 400, rateLimitHeaders(rl));
  }

  const nameStr = typeof name === "string" ? name.trim() : "";
  const emailStr = typeof email === "string" ? email.trim() : "";
  const phoneStr = typeof phone === "string" ? phone.trim() : "";
  const detailsStr = typeof details === "string" ? details.trim() : "";
  const quoteTypeRaw = typeof quoteType === "string" ? quoteType.trim() : "";
  const quoteTypeStr =
    quoteTypeRaw === "other" ? "other" : quoteTypeRaw === "exterior" ? "exterior" : "exterior";
  const quoteLabel =
    quoteTypeStr === "other" ? "Other services (no exterior package)" : "Exterior package";

  if (!nameStr || nameStr.length > LIMITS.name) {
    return json({ error: "Please enter a valid name." }, 400);
  }
  if (!emailStr || !isValidEmail(emailStr) || emailStr.length > LIMITS.email) {
    return json({ error: "Please enter a valid email address." }, 400);
  }
  if (!phoneStr || phoneStr.length > LIMITS.phone) {
    return json({ error: "Please enter a valid phone number." }, 400);
  }
  if (!detailsStr || detailsStr.length > LIMITS.details) {
    return json({ error: "Please describe your project." }, 400);
  }

  const result = await sendContactEmail({
    name: nameStr,
    email: emailStr,
    phone: phoneStr,
    details: detailsStr,
    quoteLabel,
    quoteType: quoteTypeStr,
  });

  if (!result.ok) {
    if (result.code === "not_configured") {
      return json({ error: result.error }, 503, rateLimitHeaders(rl));
    }
    return json(
      { error: "Could not send your message. Please call us or try again later." },
      500,
      rateLimitHeaders(rl),
    );
  }

  return json({ ok: true }, 200, rateLimitHeaders(rl));
}
