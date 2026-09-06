import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readCookie, verifySessionToken } from "@/lib/auth-session";

/**
 * API gate. Every /api/* request needs a valid session cookie unless it is
 * on the public allowlist (login, health, inbound webhooks, public pages).
 *
 * Transitional: the legacy `x-bhc-user-id` header (sent by older clients)
 * is still accepted until BHC_STRICT_AUTH=1, at which point only the signed
 * cookie counts. Route handlers still resolve the employee themselves —
 * this is the outer wall, not the only check.
 */

const PUBLIC_PREFIXES = [
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/contact",
  "/api/sms/inbound",
  "/api/voice/",
  "/api/ads/inbound",
  "/api/payments/webhook",
  "/api/presentations/",
  "/api/public/",
  "/api/calendar", // ICS feed for calendar apps (token-gated inside)
  "/api/seed", // guarded by SEED_SECRET / admin role inside
  "/api/automation", // accepts AUTOMATION_SECRET header inside
  "/api/ai/status",
];

const LEGACY_HEADER = "x-bhc-user-id";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) return NextResponse.next();
  // Static demo builds strip /api entirely; nothing to do
  if (process.env.NEXT_PUBLIC_STATIC_DEMO === "1") return NextResponse.next();

  // A valid cookie always identifies the caller to the route handler — including on
  // public-prefixed routes such as /api/automation that do their own role checks.
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  const session = await verifySessionToken(token);
  if (session) {
    const headers = new Headers(request.headers);
    headers.set(LEGACY_HEADER, session.employeeId);
    headers.set("x-bhc-auth", "cookie");
    return NextResponse.next({ request: { headers } });
  }

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const strict = process.env.BHC_STRICT_AUTH === "1";
  const legacy = request.headers.get(LEGACY_HEADER)?.trim();
  if (!strict && legacy) {
    const headers = new Headers(request.headers);
    headers.set("x-bhc-auth", "legacy-header");
    return NextResponse.next({ request: { headers } });
  }
  // Automation secret for machine callers on otherwise-gated routes (e.g. /api/stream, /api/ads)
  const secret = process.env.AUTOMATION_SECRET?.trim();
  const given = request.headers.get("x-bhc-automation-secret")?.trim() || request.nextUrl.searchParams.get("secret");
  if (secret && given === secret) return NextResponse.next();

  return NextResponse.json({ error: "Unauthorized — sign in at /login" }, { status: 401 });
}

export const config = {
  matcher: ["/api/:path*"],
};
