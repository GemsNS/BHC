/**
 * Lightweight in-memory rate limiter (per-process).
 * Suitable for a single Node instance; swap for Redis when multi-host.
 */

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
  retryAfterSec: number;
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function now() {
  return Date.now();
}

/** Prune occasionally to avoid unbounded growth. */
function maybePrune() {
  if (buckets.size < 5000) return;
  const t = now();
  for (const [k, b] of buckets) {
    if (b.resetAt <= t) buckets.delete(k);
  }
}

export function checkRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  maybePrune();
  const t = now();
  const existing = buckets.get(input.key);
  if (!existing || existing.resetAt <= t) {
    const resetAt = t + input.windowMs;
    buckets.set(input.key, { count: 1, resetAt });
    return {
      ok: true,
      remaining: Math.max(0, input.limit - 1),
      resetAt,
      limit: input.limit,
      retryAfterSec: Math.ceil(input.windowMs / 1000),
    };
  }
  if (existing.count >= input.limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: existing.resetAt,
      limit: input.limit,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - t) / 1000)),
    };
  }
  existing.count += 1;
  return {
    ok: true,
    remaining: Math.max(0, input.limit - existing.count),
    resetAt: existing.resetAt,
    limit: input.limit,
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - t) / 1000)),
  };
}

export function clientIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.ok ? {} : { "Retry-After": String(result.retryAfterSec) }),
  };
}

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
