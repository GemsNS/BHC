import { describe, expect, it } from "vitest";
import { checkRateLimit } from "../src/lib/rate-limit";
import { MAINFRAME_AGENTS, getMainframeAgent } from "../src/lib/mainframe-agents";

describe("rate limit", () => {
  it("allows up to limit then blocks", () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    const a = checkRateLimit({ key, limit: 2, windowMs: 60_000 });
    const b = checkRateLimit({ key, limit: 2, windowMs: 60_000 });
    const c = checkRateLimit({ key, limit: 2, windowMs: 60_000 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(c.ok).toBe(false);
    expect(c.retryAfterSec).toBeGreaterThan(0);
  });
});

describe("mainframe agents", () => {
  it("includes design/manus specialist", () => {
    expect(MAINFRAME_AGENTS.some((a) => a.id === "design")).toBe(true);
    expect(getMainframeAgent("design").label.toLowerCase()).toContain("design");
  });
});
