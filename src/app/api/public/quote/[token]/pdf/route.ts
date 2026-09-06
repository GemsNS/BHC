import { NextResponse } from "next/server";
import { renderQuotePdf } from "@/lib/documents";
import { readStore } from "@/lib/store";

type RouteParams = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteParams) {
  const { token } = await params;
  const data = await readStore();
  const q = data.quotes.find((x) => x.token === token);
  if (!q) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const buf = await renderQuotePdf(data, q);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${q.number}.pdf"`, "Cache-Control": "no-store" },
  });
}
