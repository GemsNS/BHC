import { NextResponse } from "next/server";
import { z } from "zod";
import { readStore } from "@/lib/store";

export async function POST(request: Request) {
  const schema = z.object({
    login: z.string().min(1),
    pin: z.string().min(1),
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
      e.pin === parsed.data.pin,
  );
  if (!employee) {
    return NextResponse.json({ error: "Invalid login or PIN" }, { status: 401 });
  }
  const { pin: _pin, ...safe } = employee;
  return NextResponse.json({ employee: safe });
}
