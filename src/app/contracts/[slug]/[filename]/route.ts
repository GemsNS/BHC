import { NextResponse } from "next/server";
import { readContractFile } from "@/lib/contracts-server";

type RouteParams = { params: Promise<{ slug: string; filename: string }> };

/** Named contract file e.g. /contracts/snow/contract.pdf */
export async function GET(_request: Request, { params }: RouteParams) {
  const { slug, filename } = await params;
  try {
    const file = await readContractFile(slug, filename);
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.fileName}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "Invalid contract path" }, { status: 400 });
  }
}
