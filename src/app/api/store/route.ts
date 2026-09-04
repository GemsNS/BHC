import { NextResponse } from "next/server";
import { requireApiEmployee } from "@/lib/api-auth";
import { mergeClientStoreUpdate, sanitizeStoreForClient } from "@/lib/store-client";
import { readStore, writeStore } from "@/lib/store";
import { normalizeStore } from "@/lib/normalize";
import type { AppData } from "@/lib/types";

export async function GET(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const data = await readStore();
  return NextResponse.json(sanitizeStoreForClient(data));
}

export async function PUT(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const body = (await request.json()) as Partial<AppData>;
  const existing = await readStore();
  const merged = mergeClientStoreUpdate(existing, body);
  const normalized = normalizeStore(merged);
  await writeStore(normalized);
  return NextResponse.json(sanitizeStoreForClient(normalized));
}
