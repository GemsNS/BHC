import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  sessionCookieHeader,
} from "@/lib/auth-session";
import { live } from "@/lib/events";
import {
  applyPasswordReset,
  findValidResetToken,
  MIN_PASSWORD_LENGTH,
} from "@/lib/password-reset";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { newId, nowIso, readStore, updateStoreAsync } from "@/lib/store";
import type { Employee } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Validate a reset token (for the reset page before submit). */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")?.trim() || "";
  if (!token) {
    return NextResponse.json({ valid: false, error: "Missing token" }, { status: 400 });
  }
  const data = await readStore();
  const match = findValidResetToken(data, token);
  if (!match) {
    return NextResponse.json({ valid: false, error: "Invalid or expired reset link" });
  }
  const employee = data.employees.find((e) => e.id === match.employeeId);
  return NextResponse.json({
    valid: true,
    login: employee?.login ?? null,
    name: employee?.name ?? null,
    expiresAt: match.expiresAt,
  });
}

/** Consume a reset token and set a new password. Signs the user in. */
export async function POST(request: Request) {
  const schema = z.object({
    token: z.string().min(8),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH),
  });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  }

  const ip = clientIp(request);
  const rl = checkRateLimit({ key: `reset-ip:${ip}`, limit: 10, windowMs: 3_600_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let error: string | null = "Invalid or expired reset link";
  let employee: Employee | null = null;

  await updateStoreAsync(async (data) => {
    const outcome = applyPasswordReset(
      data,
      parsed.data.token,
      parsed.data.newPassword,
      { newId, nowIso },
    );
    if (outcome.ok) {
      error = null;
      employee = { ...outcome.employee };
    } else {
      error = outcome.error;
    }
  });

  if (error || !employee) {
    return NextResponse.json({ error: error ?? "Invalid or expired reset link" }, { status: 400 });
  }

  const signedIn = employee as Employee;
  const { pin: _pin, passwordHash: _hash, ...safe } = signedIn;
  const session = await createSessionToken(signedIn.id);
  live.system(`${signedIn.name} reset password`, `${signedIn.login} · ${ip}`, "info");
  return NextResponse.json(
    { ok: true, employee: safe, mustChangePassword: false },
    { headers: { "Set-Cookie": sessionCookieHeader(session.token, session.expiresAt) } },
  );
}
