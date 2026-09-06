import { NextResponse } from "next/server";
import { readMedia } from "@/lib/media-store";
import { readStore } from "@/lib/store";

type RouteParams = { params: Promise<{ token: string; file: string }> };

/** Photos for the customer portal — only files referenced by that job. */
export async function GET(_request: Request, { params }: RouteParams) {
  const { token, file } = await params;
  const data = await readStore();
  const job = data.jobs.find((j) => j.portalToken === token);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const allowed = data.jobProgress.some((p) => p.jobId === job.id && p.imageDataUrls.some((u) => u.endsWith(`/${file}`)));
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const media = await readMedia(file);
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(media.buffer), { headers: { "Content-Type": media.mime, "Cache-Control": "private, max-age=3600" } });
}
