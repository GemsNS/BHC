import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, readStore, updateStore } from "@/lib/store";
import type { Employee, EmployeeRole } from "@/lib/types";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({ employees: data.employees });
}

export async function POST(request: Request) {
  const schema = z.object({
    name: z.string().min(1),
    email: z.string().min(1),
    login: z.string().min(1),
    pin: z.string().min(4),
    role: z.enum([
      "admin",
      "manager",
      "sales",
      "knocker",
      "field",
      "office",
      "driver",
    ]),
    phone: z.string().optional(),
    hourlyRate: z.number().nonnegative().optional(),
    hireDate: z.string().optional(),
  });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const employee: Employee = {
    id: newId(),
    name: parsed.data.name,
    email: parsed.data.email,
    login: parsed.data.login.toLowerCase(),
    pin: parsed.data.pin,
    role: parsed.data.role as EmployeeRole,
    phone: parsed.data.phone ?? "",
    hireDate: parsed.data.hireDate ?? new Date().toISOString().slice(0, 10),
    hourlyRate: parsed.data.hourlyRate ?? 20,
    active: true,
  };
  await updateStore((d) => {
    d.employees.push(employee);
  });
  return NextResponse.json({ employee }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const id = z.string().parse(body.id);
  let updated: Employee | null = null;
  await updateStore((d) => {
    const emp = d.employees.find((e) => e.id === id);
    if (!emp) return;
    if (body.role != null) emp.role = body.role;
    if (body.active != null) emp.active = Boolean(body.active);
    if (body.name != null) emp.name = String(body.name);
    if (body.phone != null) emp.phone = String(body.phone);
    if (body.hourlyRate != null) emp.hourlyRate = Number(body.hourlyRate);
    if (body.login != null) emp.login = String(body.login).toLowerCase();
    if (body.pin != null) emp.pin = String(body.pin);
    updated = emp;
  });
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ employee: updated });
}
