import { NextResponse } from "next/server";
import { Resend } from "resend";

const LIMITS = { name: 120, email: 254, phone: 40, details: 4000 } as const;

/** Lets static sites (e.g. GitHub Pages) POST to this route hosted elsewhere (Vercel). */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status: number) {
  return NextResponse.json(data, { status, headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (typeof body !== "object" || body === null) {
    return json({ error: "Invalid payload" }, 400);
  }

  const { name, email, phone, details, quoteType } = body as Record<string, unknown>;
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

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL ?? "info@bighosscontracting.ca";
  const from =
    process.env.RESEND_FROM_EMAIL ?? "Big Hoss Contracting <onboarding@resend.dev>";

  if (!apiKey) {
    return json(
      {
        error:
          "Email delivery is not configured. Add RESEND_API_KEY to .env.local (see .env.example).",
      },
      503,
    );
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [to],
    replyTo: emailStr,
    subject: `New inquiry (${quoteTypeStr === "other" ? "other services" : "exterior"}) — ${nameStr}`,
    html: `
      <p><strong>Quote type:</strong> ${escapeHtml(quoteLabel)}</p>
      <p><strong>Name:</strong> ${escapeHtml(nameStr)}</p>
      <p><strong>Email:</strong> ${escapeHtml(emailStr)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(phoneStr)}</p>
      <p><strong>Project details:</strong></p>
      <p>${escapeHtml(detailsStr).replace(/\n/g, "<br/>")}</p>
    `,
  });

  if (error) {
    console.error("[contact]", error);
    return json({ error: "Could not send your message. Please try again later." }, 500);
  }

  return json({ ok: true }, 200);
}
