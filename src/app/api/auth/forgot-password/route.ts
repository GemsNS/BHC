import { NextResponse } from "next/server";
import { z } from "zod";
import { live } from "@/lib/events";
import { mailConfigStatus } from "@/lib/mail";
import {
  findStaffByLoginOrEmail,
  issuePasswordResetToken,
  sendPasswordResetEmail,
} from "@/lib/password-reset";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { newId, nowIso, updateStoreAsync } from "@/lib/store";

export const dynamic = "force-dynamic";

const GENERIC_OK =
  "If that login or email is on file, we sent password-reset instructions. Check your inbox (and spam).";

/**
 * Request a password-reset email.
 * Always returns a generic success message to avoid account enumeration.
 */
export async function POST(request: Request) {
  const schema = z.object({
    loginOrEmail: z.string().min(1).max(200),
  });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your login or email." }, { status: 400 });
  }

  const ip = clientIp(request);
  const loginKey = parsed.data.loginOrEmail.trim().toLowerCase();
  const ipLimit = checkRateLimit({ key: `forgot-ip:${ip}`, limit: 8, windowMs: 3_600_000 });
  const loginLimit = checkRateLimit({
    key: `forgot-login:${loginKey}`,
    limit: 4,
    windowMs: 3_600_000,
  });
  if (!ipLimit.ok || !loginLimit.ok) {
    return NextResponse.json(
      { error: "Too many reset requests. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(ipLimit.retryAfterSec, loginLimit.retryAfterSec),
          ),
        },
      },
    );
  }

  const mail = mailConfigStatus();
  let mailed = false;
  let mailError: string | null = null;

  await updateStoreAsync(async (data) => {
    const employee = findStaffByLoginOrEmail(data, loginKey);
    if (!employee) return;
    if (!employee.email?.includes("@")) {
      live.system(
        `Password reset skipped for ${employee.login}`,
        "no email on file",
        "warn",
      );
      return;
    }
    const { rawToken } = issuePasswordResetToken(data, employee.id, { newId, nowIso });
    if (!mail.configured) {
      mailError = "Email is not configured on the server.";
      live.system(
        `Password reset token created for ${employee.login}`,
        "SMTP/Resend not configured — email not sent",
        "warn",
      );
      return;
    }
    const sent = await sendPasswordResetEmail({
      to: employee.email,
      name: employee.name,
      login: employee.login,
      rawToken,
    });
    mailed = sent.ok;
    mailError = sent.error;
    live.system(
      mailed
        ? `Password reset email sent to ${employee.login}`
        : `Password reset email failed for ${employee.login}`,
      mailed ? employee.email : mailError || "send failed",
      mailed ? "info" : "warn",
    );
  });

  // Still return generic OK when the account exists but mail failed —
  // operators can use `npm run bhc -- auth reset-link <login>`.
  void mailed;
  void mailError;

  return NextResponse.json({ ok: true, message: GENERIC_OK });
}

export async function GET() {
  const mail = mailConfigStatus();
  return NextResponse.json({
    ok: true,
    mailConfigured: mail.configured,
    provider: mail.provider,
    hint: "POST { loginOrEmail } to request a reset email",
  });
}
