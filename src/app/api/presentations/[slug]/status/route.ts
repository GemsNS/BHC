import { NextRequest, NextResponse } from "next/server";
import {
  presentationCookieName,
  presentationUnlocked,
  readPresentationManifest,
  readPresentationMeta,
} from "@/lib/presentations";

type RouteParams = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const meta = await readPresentationMeta(slug);
  if (!meta) {
    return NextResponse.json({ error: "Presentation not found" }, { status: 404 });
  }

  const cookie = request.cookies.get(presentationCookieName(slug))?.value;
  const unlocked = presentationUnlocked(cookie, meta);
  if (!unlocked) {
    return NextResponse.json({
      ok: true,
      unlocked: false,
      title: meta.title,
      customerName: meta.customerName,
      address: meta.address,
    });
  }

  const manifest = await readPresentationManifest(slug);
  return NextResponse.json({
    ok: true,
    unlocked: true,
    title: meta.title,
    customerName: meta.customerName,
    address: meta.address,
    email: meta.email,
    manifest,
  });
}
