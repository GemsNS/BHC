import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

export const QB_DEFAULT_DOMAIN = "bhcontracting.ca";

export const QB_DEFAULT_SCOPES = [
  "com.intuit.quickbooks.accounting",
  "com.intuit.quickbooks.payment",
  "openid",
  "profile",
  "email",
  "phone",
  "address",
].join(" ");

export type QbStoredConnection = {
  realmId: string;
  refreshToken: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  environment: "sandbox" | "production";
  connectedAt: string;
  connectedById?: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const QB_PATH = path.join(DATA_DIR, "qb-connection.json");

export function appBaseUrl(): string {
  const fromEnv = process.env.APP_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return `https://${QB_DEFAULT_DOMAIN}`;
}

export function qbRedirectUri(): string {
  return (
    process.env.QUICKBOOKS_REDIRECT_URI?.trim() ||
    `${appBaseUrl()}/api/quickbooks/callback`
  );
}

export function qbClientId(): string | undefined {
  return process.env.QUICKBOOKS_CLIENT_ID?.trim();
}

export function qbClientSecret(): string | undefined {
  return process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
}

export function qbEnvironment(): "sandbox" | "production" {
  const env = process.env.QUICKBOOKS_ENV?.trim().toLowerCase();
  if (env === "sandbox") return "sandbox";
  return "production";
}

export function qbEnvironmentLabel(env: "sandbox" | "production" = qbEnvironment()): string {
  return env === "production" ? "Production (live books)" : "Sandbox";
}

export function qbApiBase(env: "sandbox" | "production"): string {
  return env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

export function oauthConfigured(): boolean {
  return Boolean(qbClientId() && qbClientSecret());
}

export async function readQbConnection(): Promise<QbStoredConnection | null> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(QB_PATH, "utf8");
    return JSON.parse(raw) as QbStoredConnection;
  } catch {
    return null;
  }
}

export async function writeQbConnection(conn: QbStoredConnection): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(QB_PATH, JSON.stringify(conn, null, 2), "utf8");
}

export async function clearQbConnection(): Promise<void> {
  try {
    await writeFile(QB_PATH, "{}", "utf8");
  } catch {
    /* no file yet */
  }
}

export function newOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function buildAuthorizeUrl(state: string): string {
  const clientId = qbClientId();
  if (!clientId) throw new Error("QUICKBOOKS_CLIENT_ID is not set");
  const url = new URL("https://appcenter.intuit.com/connect/oauth2");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", qbRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", QB_DEFAULT_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
};

export async function exchangeAuthorizationCode(code: string): Promise<TokenResponse> {
  const clientId = qbClientId();
  const clientSecret = qbClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("QuickBooks client ID and secret must be set in environment variables");
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: qbRedirectUri(),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const clientId = qbClientId();
  const clientSecret = qbClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("QuickBooks client ID and secret must be set in environment variables");
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function getValidAccessToken(): Promise<{
  accessToken: string;
  connection: QbStoredConnection;
  refreshed: boolean;
}> {
  const conn = await readQbConnection();
  if (!conn?.refreshToken || !conn.realmId) {
    throw new Error("QuickBooks is not connected. Use Connect in Admin → Books.");
  }
  const expiresAt = conn.accessTokenExpiresAt
    ? new Date(conn.accessTokenExpiresAt).getTime()
    : 0;
  if (conn.accessToken && expiresAt > Date.now() + 60_000) {
    return { accessToken: conn.accessToken, connection: conn, refreshed: false };
  }
  const tokens = await refreshAccessToken(conn.refreshToken);
  const updated: QbStoredConnection = {
    ...conn,
    accessToken: tokens.access_token,
    accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    refreshToken: tokens.refresh_token ?? conn.refreshToken,
  };
  await writeQbConnection(updated);
  return { accessToken: tokens.access_token, connection: updated, refreshed: true };
}
