import { NextResponse } from "next/server";
import { requireApiEmployee } from "@/lib/api-auth";
import {
  appBaseUrl,
  buildAuthorizeUrl,
  newOAuthState,
  oauthConfigured,
} from "@/lib/quickbooks-oauth";

const STATE_COOKIE = "qb-oauth-state";

function startOAuthResponse(state: string, authorizeUrl: string): NextResponse {
  const res = NextResponse.json({ authorizeUrl, state });
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}

/** Intuit Connect URL — redirect to Books (user clicks Connect there). */
export async function GET() {
  return NextResponse.redirect(`${appBaseUrl()}/admin/books`);
}

/** Start OAuth — returns Intuit authorize URL (client redirects). */
export async function POST(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;

  if (!oauthConfigured()) {
    return NextResponse.json(
      {
        error:
          "Set QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET in server .env first.",
      },
      { status: 503 },
    );
  }

  const state = newOAuthState();
  const authorizeUrl = buildAuthorizeUrl(state);
  return startOAuthResponse(state, authorizeUrl);
}
