import { NextRequest, NextResponse } from "next/server";
import {
  appBaseUrl,
  exchangeAuthorizationCode,
  oauthConfigured,
  qbEnvironment,
  writeQbConnection,
} from "@/lib/quickbooks-oauth";

const STATE_COOKIE = "qb-oauth-state";

export async function GET(request: NextRequest) {
  const base = appBaseUrl();
  const booksUrl = `${base}/admin/books`;

  if (!oauthConfigured()) {
    return NextResponse.redirect(`${booksUrl}?qb=error&reason=not_configured`);
  }

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(
      `${booksUrl}?qb=error&reason=${encodeURIComponent(error)}`,
    );
  }

  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get(STATE_COOKIE)?.value;

  if (!code || !realmId || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(`${booksUrl}?qb=error&reason=invalid_state`);
  }

  try {
    const tokens = await exchangeAuthorizationCode(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(`${booksUrl}?qb=error&reason=no_refresh_token`);
    }
    await writeQbConnection({
      realmId,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: new Date(
        Date.now() + tokens.expires_in * 1000,
      ).toISOString(),
      environment: qbEnvironment(),
      connectedAt: new Date().toISOString(),
    });
    const res = NextResponse.redirect(`${booksUrl}?qb=connected`);
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "token_exchange_failed";
    return NextResponse.redirect(
      `${booksUrl}?qb=error&reason=${encodeURIComponent(msg.slice(0, 120))}`,
    );
  }
}
