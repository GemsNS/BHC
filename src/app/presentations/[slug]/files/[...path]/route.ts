import { NextRequest, NextResponse } from "next/server";
import {
  presentationCookieName,
  presentationUnlocked,
  readPresentationAsset,
  readPresentationMeta,
} from "@/lib/presentations";

type RouteParams = { params: Promise<{ slug: string; path: string[] }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug, path: parts } = await params;
  const meta = await readPresentationMeta(slug);
  if (!meta) {
    return NextResponse.json({ error: "Presentation not found" }, { status: 404 });
  }

  const cookie = request.cookies.get(presentationCookieName(slug))?.value;
  if (!presentationUnlocked(cookie, meta)) {
    return NextResponse.json({ error: "Password required" }, { status: 401 });
  }

  const relative = parts.map(decodeURIComponent).join("/");
  const file = await readPresentationAsset(slug, relative);
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const disposition = /\.(html?|png|jpe?g|webp|svg|pdf)$/i.test(file.fileName)
    ? "inline"
    : "attachment";

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `${disposition}; filename="${file.fileName}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
