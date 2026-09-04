import { describe, expect, it, afterEach } from "vitest";
import { getAIStatus, resolveAIProvider } from "../src/lib/ai-provider";

describe("ai provider", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("prefers anthropic/claude when ANTHROPIC_API_KEY is set", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(resolveAIProvider()).toBe("anthropic");
    const status = getAIStatus();
    expect(status.configured).toBe(true);
    expect(status.provider).toBe("anthropic");
    expect(status.anthropic).toBe(true);
  });

  it("falls back to gemini when only GEMINI_API_KEY is set", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";
    expect(resolveAIProvider()).toBe("gemini");
    const status = getAIStatus();
    expect(status.configured).toBe(true);
    expect(status.provider).toBe("gemini");
    expect(status.gemini).toBe(true);
  });

  it("falls back to openai when only OPENAI_API_KEY is set", () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    expect(resolveAIProvider()).toBe("openai");
    expect(getAIStatus().provider).toBe("openai");
  });

  it("returns none without keys", () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(resolveAIProvider()).toBe("none");
    expect(getAIStatus().configured).toBe(false);
  });

  it("respects AI_PROVIDER override", () => {
    process.env.ANTHROPIC_API_KEY = "a";
    process.env.GEMINI_API_KEY = "g";
    process.env.OPENAI_API_KEY = "o";
    process.env.AI_PROVIDER = "openai";
    expect(resolveAIProvider()).toBe("openai");
  });
});
