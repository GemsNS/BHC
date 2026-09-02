import { Resend } from "resend";
import nodemailer from "nodemailer";

export type ContactEmailInput = {
  name: string;
  email: string;
  phone: string;
  details: string;
  quoteLabel: string;
  quoteType: "exterior" | "other";
};

export type MailConfigStatus = {
  configured: boolean;
  provider: "smtp" | "resend" | "none";
  to: string | null;
  from: string | null;
};

function contactToEmail(): string {
  return (
    process.env.CONTACT_TO_EMAIL?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "info@bhcontracting.ca"
  );
}

function smtpFromEmail(): string {
  const explicit = process.env.SMTP_FROM?.trim();
  if (explicit) return explicit;
  const user = process.env.SMTP_USER?.trim();
  if (user) return `BH Contracting LTD. <${user}>`;
  return "BH Contracting LTD. <noreply@bhcontracting.ca>";
}

function resendFromEmail(): string {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "BH Contracting LTD. <onboarding@resend.dev>"
  );
}

export function mailConfigStatus(): MailConfigStatus {
  const to = contactToEmail();
  if (smtpConfigured()) {
    return { configured: true, provider: "smtp", to, from: smtpFromEmail() };
  }
  if (process.env.RESEND_API_KEY?.trim()) {
    return { configured: true, provider: "resend", to, from: resendFromEmail() };
  }
  return { configured: false, provider: "none", to: null, from: null };
}

function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim(),
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildContactHtml(input: ContactEmailInput): string {
  return `
    <p><strong>Quote type:</strong> ${escapeHtml(input.quoteLabel)}</p>
    <p><strong>Name:</strong> ${escapeHtml(input.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(input.email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(input.phone)}</p>
    <p><strong>Project details:</strong></p>
    <p>${escapeHtml(input.details).replace(/\n/g, "<br/>")}</p>
  `;
}

function buildContactSubject(input: ContactEmailInput): string {
  const kind = input.quoteType === "other" ? "other services" : "exterior";
  return `New inquiry (${kind}) — ${input.name}`;
}

function buildContactText(input: ContactEmailInput): string {
  return [
    `Quote type: ${input.quoteLabel}`,
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Phone: ${input.phone}`,
    "",
    "Project details:",
    input.details,
  ].join("\n");
}

async function sendViaSmtp(input: ContactEmailInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const host = process.env.SMTP_HOST!.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || "465");
  const secure = process.env.SMTP_SECURE?.trim() !== "false";
  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASS!.trim();

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: smtpFromEmail(),
      to: contactToEmail(),
      replyTo: input.email,
      subject: buildContactSubject(input),
      text: buildContactText(input),
      html: buildContactHtml(input),
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "SMTP send failed";
    console.error("[contact/smtp]", message);
    return { ok: false, error: message };
  }
}

async function sendViaResend(
  input: ContactEmailInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY!.trim();
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: resendFromEmail(),
    to: [contactToEmail()],
    replyTo: input.email,
    subject: buildContactSubject(input),
    html: buildContactHtml(input),
  });
  if (error) {
    console.error("[contact/resend]", error);
    return { ok: false, error: error.message || "Resend send failed" };
  }
  return { ok: true };
}

export async function sendContactEmail(
  input: ContactEmailInput,
): Promise<{ ok: true } | { ok: false; error: string; code: "not_configured" | "send_failed" }> {
  if (smtpConfigured()) {
    const result = await sendViaSmtp(input);
    if (result.ok) return result;
    return { ok: false, error: result.error, code: "send_failed" };
  }

  if (process.env.RESEND_API_KEY?.trim()) {
    const result = await sendViaResend(input);
    if (result.ok) return result;
    return { ok: false, error: result.error, code: "send_failed" };
  }

  return {
    ok: false,
    error:
      "Email is not configured on the server. Set GoDaddy SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS) or RESEND_API_KEY.",
    code: "not_configured",
  };
}
