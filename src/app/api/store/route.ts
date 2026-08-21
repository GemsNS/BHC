import { NextResponse } from "next/server";
import { readStore, writeStore } from "@/lib/store";
import { normalizeStore } from "@/lib/normalize";
import type { AppData } from "@/lib/types";

export async function GET() {
  const data = await readStore();
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Partial<AppData>;
  const normalized = normalizeStore(body);
  await writeStore(normalized);
  return NextResponse.json(normalized);
}
