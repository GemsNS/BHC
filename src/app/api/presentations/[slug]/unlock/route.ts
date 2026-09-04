import { NextRequest, NextResponse } from "next/server";
import {
  presentationCookieName,
  readPresentationMeta,
  verifyPresentationPassword,
} from "@/lib/presentations";
import {
  checkRateLimit,
  clientIp,
  envInt,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { verifyCaptchaToken } from "@/lib/captcha";

type RouteParams = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const meta = await readPresentationMeta(slug);
  if (!meta) {
    return NextResponse.json({ error: "Presentation not found" }, { status: 404 });
  }

  const ip = clientIp(request);
  const rl = checkRateLimit({
    key: `pres-unlock:${slug}:${ip}`,
    limit: envInt("PRESENTATION_UNLOCK_RATE_PER_HOUR", 20),
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many unlock attempts. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
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
  const captchaToken =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { captchaToken?: unknown }).captchaToken === "string"
      ? (body as { captchaToken: string }).captchaToken
      : undefined;

  const captcha = await verifyCaptchaToken({ token: captchaToken, ip });
  if (!captcha.ok) {
    return NextResponse.json(
      { error: captcha.error || "Captcha required." },
      { status: 400, headers: rateLimitHeaders(rl) },
    );
  }

  if (!verifyPresentationPassword(password, meta.passwordSha256)) {
    return NextResponse.json(
      { error: "Incorrect password" },
      { status: 401, headers: rateLimitHeaders(rl) },
    );
  }

  const res = NextResponse.json({
    ok: true,
    title: meta.title,
    customerName: meta.customerName,
  });
  Object.entries(rateLimitHeaders(rl)).forEach(([k, v]) => res.headers.set(k, v));
  res.cookies.set(presentationCookieName(slug), meta.passwordSha256, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
