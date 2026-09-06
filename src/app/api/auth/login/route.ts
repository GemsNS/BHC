import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, verifyStaffSecret } from "@/lib/auth-credentials";
import {
  clearFailedLogins,
  createSessionToken,
  lockoutRemaining,
  recordFailedLogin,
  sessionCookieHeader,
} from "@/lib/auth-session";
import { live } from "@/lib/events";
import { clientIp } from "@/lib/rate-limit";
import { readStore, updateStore } from "@/lib/store";

export async function POST(request: Request) {
  const schema = z.object({
    login: z.string().min(1),
    password: z.string().min(1),
  });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const login = parsed.data.login.trim().toLowerCase();
  const ip = clientIp(request);
  const keys = [`login:${login}`, `ip:${ip}`];
  const locked = Math.max(...keys.map((k) => lockoutRemaining(k)));
  if (locked > 0) {
    live.system(`Login blocked for ${login}`, `locked out for ${Math.ceil(locked / 60)} more min (${ip})`, "warn");
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${Math.ceil(locked / 60)} minute(s).` },
      { status: 429, headers: { "Retry-After": String(locked) } },
    );
  }

  const data = await readStore();
  const employee = data.employees.find(
    (e) =>
      e.active &&
      (e.login.toLowerCase() === login || e.email.toLowerCase() === login) &&
      verifyStaffSecret(e, parsed.data.password),
  );
  if (!employee) {
    const results = keys.map((k) => recordFailedLogin(k));
    const remaining = Math.min(...results.map((r) => r.remainingAttempts));
    live.system(`Failed login for ${login}`, `${ip} · ${remaining} attempt(s) left`, "warn");
    return NextResponse.json(
      { error: remaining > 0 ? `Invalid login or password (${remaining} attempt${remaining === 1 ? "" : "s"} left)` : "Too many failed attempts — locked for 15 minutes." },
      { status: remaining > 0 ? 401 : 429 },
    );
  }
  for (const k of keys) clearFailedLogins(k);
  const mustChangePassword = Boolean(employee.mustChangePassword || !employee.passwordHash);
  const { pin: _pin, passwordHash: _hash, ...safe } = employee;
  const { token, expiresAt } = await createSessionToken(employee.id);
  live.system(`${employee.name} signed in`, `${employee.role} · ${ip}`, "info");
  return NextResponse.json(
    { employee: safe, mustChangePassword },
    { headers: { "Set-Cookie": sessionCookieHeader(token, expiresAt) } },
  );
}

export async function PATCH(request: NextRequest) {
  const schema = z.object({
    employeeId: z.string().min(1),
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
  });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  let ok = false;
  await updateStore((data) => {
    const emp = data.employees.find((e) => e.id === parsed.data.employeeId);
    if (!emp || !verifyStaffSecret(emp, parsed.data.currentPassword)) return;
    emp.passwordHash = hashPassword(parsed.data.newPassword);
    emp.mustChangePassword = false;
    ok = true;
  });

  if (!ok) {
    return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
