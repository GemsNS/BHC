import { NextResponse } from "next/server";
import { readMedia } from "@/lib/media-store";

type RouteParams = { params: Promise<{ file: string }> };

/** Serves offloaded photos / signatures / PDFs. Auth: middleware (session cookie). */
export async function GET(_request: Request, { params }: RouteParams) {
  const { file } = await params;
  const media = await readMedia(file);
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(media.buffer), {
    headers: {
      "Content-Type": media.mime,
      "Cache-Control": "private, max-age=86400, immutable",
      "Content-Disposition": `inline; filename="${file}"`,
    },
  });
}
