import { NextRequest, NextResponse } from "next/server";
import { requireApiEmployee } from "@/lib/api-auth";
import { readUploadFile, listUploads } from "@/lib/uploads";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;

  const { id } = await params;
  const items = await listUploads(500);
  const meta = items.find((i) => i.id === id || i.storedName === id);
  if (!meta) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const buf = await readUploadFile(meta.storedName);
  if (!buf) {
    return NextResponse.json({ error: "Missing file" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": meta.mimeType,
      "Content-Disposition": `inline; filename="${meta.originalName}"`,
      "Cache-Control": "private, max-age=120",
    },
  });
}
