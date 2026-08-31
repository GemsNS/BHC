import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, verifyStaffSecret } from "@/lib/auth-credentials";
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
  const data = await readStore();
  const employee = data.employees.find(
    (e) =>
      e.active &&
      (e.login.toLowerCase() === login || e.email.toLowerCase() === login) &&
      verifyStaffSecret(e, parsed.data.password),
  );
  if (!employee) {
    return NextResponse.json({ error: "Invalid login or password" }, { status: 401 });
  }
  const mustChangePassword = Boolean(
    employee.mustChangePassword || !employee.passwordHash,
  );
  const { pin: _pin, passwordHash: _hash, ...safe } = employee;
  return NextResponse.json({
    employee: safe,
    mustChangePassword,
  });
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
