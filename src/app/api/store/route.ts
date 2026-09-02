import { NextResponse } from "next/server";
import { requireApiEmployee } from "@/lib/api-auth";
import { readStore, writeStore } from "@/lib/store";
import { normalizeStore } from "@/lib/normalize";
import type { AppData } from "@/lib/types";

export async function GET(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const data = await readStore();
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const body = (await request.json()) as Partial<AppData>;
  const normalized = normalizeStore(body);
  await writeStore(normalized);
  return NextResponse.json(normalized);
}
