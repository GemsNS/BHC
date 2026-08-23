import { NextResponse } from "next/server";
import { buildMarketPulse } from "@/lib/market-intel";
import { readStore } from "@/lib/store";

export async function GET() {
  const data = await readStore();
  const pulse = await buildMarketPulse(data);
  return NextResponse.json(pulse);
}
