import { NextRequest, NextResponse } from "next/server";
import { buildHrmContextSummary, fetchHrmWeather, geocodeNovaScotia } from "@/lib/hrm-public";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "summary";
  try {
    if (type === "weather") {
      const weather = await fetchHrmWeather();
      return NextResponse.json({ ok: true, weather });
    }
    if (type === "geocode") {
      const q = req.nextUrl.searchParams.get("q") ?? "";
      const results = await geocodeNovaScotia(q);
      return NextResponse.json({ ok: true, results });
    }
    const summary = await buildHrmContextSummary();
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "HRM lookup failed" },
      { status: 502 },
    );
  }
}
