import { NextResponse } from "next/server";
import { requireApiEmployee } from "@/lib/api-auth";
import {
  oauthConfigured,
  qbEnvironment,
  qbRedirectUri,
  readQbConnection,
} from "@/lib/quickbooks-oauth";

export async function GET(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;

  const conn = await readQbConnection();
  return NextResponse.json({
    oauthConfigured: oauthConfigured(),
    connected: Boolean(conn?.refreshToken && conn.realmId),
    realmId: conn?.realmId ?? null,
    environment: conn?.environment ?? qbEnvironment(),
    connectedAt: conn?.connectedAt ?? null,
    redirectUri: qbRedirectUri(),
  });
}
