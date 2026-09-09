import { hashPassword, DEFAULT_STAFF_PIN } from "./auth-credentials";
import { publicToken } from "./numbering";
import { sendEmail } from "./mail";
import type { AppData, Employee, PasswordResetToken } from "./types";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
export const MIN_PASSWORD_LENGTH = 6;

type Ctx = { newId: () => string; nowIso: () => string };

export function findStaffByLoginOrEmail(
  data: AppData,
  loginOrEmail: string,
): Employee | undefined {
  const key = loginOrEmail.trim().toLowerCase();
  if (!key) return undefined;
  return data.employees.find(
    (e) =>
      e.active &&
      (e.login.toLowerCase() === key || e.email.toLowerCase() === key),
  );
}

export function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://bhcontracting.ca"
  ).replace(/\/$/, "");
}

export function passwordResetUrl(rawToken: string): string {
  return `${appBaseUrl()}/login/reset-password?token=${encodeURIComponent(rawToken)}`;
}

/** Invalidate unused tokens for an employee, then issue a fresh one. Returns the raw token. */
export function issuePasswordResetToken(
  data: AppData,
  employeeId: string,
  ctx: Ctx,
): { rawToken: string; record: PasswordResetToken } {
  if (!data.passwordResetTokens) data.passwordResetTokens = [];
  const now = Date.now();
  for (const t of data.passwordResetTokens) {
    if (t.employeeId === employeeId && !t.usedAt) {
      t.usedAt = ctx.nowIso();
    }
  }
  // Cap history
  if (data.passwordResetTokens.length > 200) {
    data.passwordResetTokens = data.passwordResetTokens
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
  }
  const rawToken = publicToken(ctx.newId);
  const record: PasswordResetToken = {
    id: ctx.newId(),
    employeeId,
    tokenHash: hashPassword(rawToken),
    expiresAt: new Date(now + PASSWORD_RESET_TTL_MS).toISOString(),
    createdAt: ctx.nowIso(),
    usedAt: null,
  };
  data.passwordResetTokens.unshift(record);
  return { rawToken, record };
}

export function findValidResetToken(
  data: AppData,
  rawToken: string,
  now = Date.now(),
): PasswordResetToken | null {
  const hash = hashPassword(rawToken.trim());
  if (!hash || !rawToken.trim()) return null;
  const tokens = data.passwordResetTokens ?? [];
  const match = tokens.find((t) => t.tokenHash === hash);
  if (!match) return null;
  if (match.usedAt) return null;
  if (new Date(match.expiresAt).getTime() <= now) return null;
  return match;
}

export function applyPasswordReset(
  data: AppData,
  rawToken: string,
  newPassword: string,
  ctx: Ctx,
): { ok: true; employee: Employee } | { ok: false; error: string } {
  const password = newPassword.trim();
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  const token = findValidResetToken(data, rawToken);
  if (!token) {
    return { ok: false, error: "This reset link is invalid or has expired. Request a new one." };
  }
  const employee = data.employees.find((e) => e.id === token.employeeId && e.active);
  if (!employee) {
    return { ok: false, error: "Account not found or inactive." };
  }
  employee.passwordHash = hashPassword(password);
  employee.mustChangePassword = false;
  token.usedAt = ctx.nowIso();
  // Invalidate any other open tokens for this employee
  for (const t of data.passwordResetTokens ?? []) {
    if (t.employeeId === employee.id && t.id !== token.id && !t.usedAt) {
      t.usedAt = ctx.nowIso();
    }
  }
  return { ok: true, employee };
}

/** Ops bootstrap: clear password, restore default PIN, force set-password on next login. */
export function bootstrapStaffPassword(
  employee: Employee,
  pin = DEFAULT_STAFF_PIN,
): void {
  employee.pin = pin;
  employee.passwordHash = null;
  employee.mustChangePassword = true;
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  login: string;
  rawToken: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const url = passwordResetUrl(input.rawToken);
  const hours = Math.round(PASSWORD_RESET_TTL_MS / 3_600_000);
  const text = [
    `Hi ${input.name},`,
    "",
    "We received a request to reset your BH Contracting workspace password.",
    "",
    `Login: ${input.login}`,
    "",
    "Open this link to choose a new password (expires in about " +
      hours +
      " hour):",
    url,
    "",
    "If you did not request this, you can ignore this email — your password will stay the same.",
    "",
    "— BH Contracting LTD.",
  ].join("\n");
  const html = `
    <p>Hi ${escapeHtml(input.name)},</p>
    <p>We received a request to reset your BH Contracting workspace password.</p>
    <p><strong>Login:</strong> ${escapeHtml(input.login)}</p>
    <p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 18px;background:#c45c26;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Reset password</a></p>
    <p style="color:#666;font-size:13px">Or paste this link into your browser:<br/>${escapeHtml(url)}</p>
    <p style="color:#666;font-size:13px">This link expires in about ${hours} hour. If you did not request a reset, ignore this email.</p>
    <p>— BH Contracting LTD.</p>
  `;
  const result = await sendEmail({
    to: input.to,
    subject: "Reset your BH Contracting password",
    text,
    html,
  });
  return { ok: result.ok, error: result.error };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
