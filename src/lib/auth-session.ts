/**
 * Signed, httpOnly session cookies + login lockout.
 *
 * Cookie value: `<employeeId>.<expiresMs>.<hmac>`; HMAC-SHA256 over
 * `<employeeId>.<expiresMs>` with SESSION_SECRET. Uses Web Crypto so the same
 * code verifies in Next middleware (edge) and in route handlers (node).
 *
 * Env:
 *   SESSION_SECRET        long random string (required in production; a dev
 *                         fallback is derived so local runs still work)
 *   SESSION_TTL_DAYS      30
 *   AUTH_LOCKOUT_ATTEMPTS 5     failures before lockout (per login + per IP)
 *   AUTH_LOCKOUT_MINUTES  15
 */

export const SESSION_COOKIE = "bhc_session";

function secret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    // Still works, but every restart invalidates sessions — the health endpoint warns about it.
    return process.env.AUTOMATION_SECRET?.trim() || "bhc-unset-session-secret";
  }
  return "bhc-dev-session-secret";
}

export function sessionSecretConfigured(): boolean {
  return Boolean(process.env.SESSION_SECRET?.trim());
}

function ttlMs(): number {
  const days = Number(process.env.SESSION_TTL_DAYS ?? "30");
  return (Number.isFinite(days) && days > 0 ? days : 30) * 86_400_000;
}

async function hmac(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(employeeId: string, now = Date.now()): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = now + ttlMs();
  const payload = `${employeeId}.${expiresAt}`;
  return { token: `${payload}.${await hmac(payload)}`, expiresAt };
}

export async function verifySessionToken(token: string | undefined | null, now = Date.now()): Promise<{ employeeId: string; expiresAt: number } | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [employeeId, expStr, sig] = parts;
  const expiresAt = Number(expStr);
  if (!employeeId || !Number.isFinite(expiresAt) || expiresAt < now) return null;
  const expected = await hmac(`${employeeId}.${expiresAt}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? { employeeId, expiresAt } : null;
}

export function sessionCookieHeader(token: string, expiresAt: number): string {
  const secure = process.env.NODE_ENV === "production" && process.env.SESSION_COOKIE_INSECURE !== "1";
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/* ------------------------------ lockout ------------------------------ */

type Attempt = { count: number; until: number };
const LOCK_KEY = Symbol.for("bhc.auth.lockout");

function locks(): Map<string, Attempt> {
  const g = globalThis as unknown as Record<symbol, Map<string, Attempt> | undefined>;
  if (!g[LOCK_KEY]) g[LOCK_KEY] = new Map();
  return g[LOCK_KEY]!;
}

function lockoutPolicy() {
  const attempts = Number(process.env.AUTH_LOCKOUT_ATTEMPTS ?? "5");
  const minutes = Number(process.env.AUTH_LOCKOUT_MINUTES ?? "15");
  return {
    attempts: Number.isFinite(attempts) && attempts > 0 ? attempts : 5,
    windowMs: (Number.isFinite(minutes) && minutes > 0 ? minutes : 15) * 60_000,
  };
}

/** Seconds remaining if locked, else 0. */
export function lockoutRemaining(key: string, now = Date.now()): number {
  const a = locks().get(key);
  if (!a) return 0;
  if (a.until <= now) {
    locks().delete(key);
    return 0;
  }
  const { attempts } = lockoutPolicy();
  return a.count >= attempts ? Math.ceil((a.until - now) / 1000) : 0;
}

export function recordFailedLogin(key: string, now = Date.now()): { locked: boolean; remainingAttempts: number } {
  const { attempts, windowMs } = lockoutPolicy();
  const a = locks().get(key);
  const next: Attempt = a && a.until > now ? { count: a.count + 1, until: now + windowMs } : { count: 1, until: now + windowMs };
  locks().set(key, next);
  return { locked: next.count >= attempts, remainingAttempts: Math.max(0, attempts - next.count) };
}

export function clearFailedLogins(key: string) {
  locks().delete(key);
}
