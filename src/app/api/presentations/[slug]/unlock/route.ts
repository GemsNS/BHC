import { NextRequest, NextResponse } from "next/server";
import {
  presentationCookieName,
  readPresentationMeta,
  verifyPresentationPassword,
} from "@/lib/presentations";

type RouteParams = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const meta = await readPresentationMeta(slug);
  if (!meta) {
    return NextResponse.json({ error: "Presentation not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const password =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { password?: unknown }).password === "string"
      ? (body as { password: string }).password
      : "";

  if (!verifyPresentationPassword(password, meta.passwordSha256)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({
    ok: true,
    title: meta.title,
    customerName: meta.customerName,
  });
  res.cookies.set(presentationCookieName(slug), meta.passwordSha256, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
