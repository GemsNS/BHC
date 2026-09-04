import { NextResponse } from "next/server";
import { readContractFile } from "@/lib/contracts-server";

type RouteParams = { params: Promise<{ slug: string }> };

/** Public contract document — direct link only (not linked from marketing site). */
export async function GET(_request: Request, { params }: RouteParams) {
  const { slug } = await params;
  try {
    const file = await readContractFile(slug);
    if (!file) {
      return NextResponse.json(
        { error: "Contract not found. Add a document under contracts/" + slug + "/" },
        { status: 404 },
      );
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
