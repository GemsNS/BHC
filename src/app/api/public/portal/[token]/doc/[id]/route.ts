import { NextResponse } from "next/server";
import { readMedia } from "@/lib/media-store";
import { readStore } from "@/lib/store";

type RouteParams = { params: Promise<{ token: string; id: string }> };

/** PDFs already sent to the customer, downloadable from the portal. */
export async function GET(_request: Request, { params }: RouteParams) {
  const { token, id } = await params;
  const data = await readStore();
  const job = data.jobs.find((j) => j.portalToken === token);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const doc = data.documents.find((d) => d.id === id && d.jobId === job.id && d.sentAt);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const media = await readMedia(doc.fileUrl.split("/").pop()!);
  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(media.buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${doc.number}.pdf"` } });
}
