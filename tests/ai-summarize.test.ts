import { describe, expect, it } from "vitest";
import { summarizeProgress } from "../src/lib/ai-summarize";

describe("ai summarize", () => {
  it("falls back to local summary without API key", async () => {
    const prevOpen = process.env.OPENAI_API_KEY;
    const prevGemini = process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const result = await summarizeProgress({
      jobTitle: "Harbor Lane deck",
      customerName: "Test",
      notes: ["Framing done", "Wrap pending"],
      imageCount: 2,
    });
    expect(result.source).toBe("local");
    expect(result.summary).toContain("Harbor Lane deck");
    expect(result.summary).toContain("Framing done");
    if (prevOpen) process.env.OPENAI_API_KEY = prevOpen;
    if (prevGemini) process.env.GEMINI_API_KEY = prevGemini;
  });
});
