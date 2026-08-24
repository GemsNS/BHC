/**
 * AI / local summarizer for job progress notes.
 * Uses Gemini or OpenAI via ai-provider when configured; otherwise a local heuristic.
 */

import { completeChat, resolveAIProvider } from "./ai-provider";

export async function summarizeProgress(input: {
  jobTitle: string;
  customerName: string;
  notes: string[];
  imageCount: number;
}): Promise<{ summary: string; source: "ai" | "local" }> {
  const blob = input.notes.filter(Boolean).join("\n• ");
  const local = buildLocalSummary(input);

  const result = await completeChat({
    system:
      "You summarize field crew job progress for a contracting company. Be concise, professional, and suitable for customer-facing job reports. Use short bullet points. Mention photo count if provided. Do not invent facts.",
    user: `Job: ${input.jobTitle}\nCustomer: ${input.customerName}\nPhotos attached: ${input.imageCount}\nCrew notes:\n• ${blob || "(none)"}`,
    temperature: 0.3,
  });

  if (!result?.text) {
    return { summary: local, source: "local" };
  }

  return { summary: result.text, source: resolveAIProvider() === "none" ? "local" : "ai" };
}

function buildLocalSummary(input: {
  jobTitle: string;
  customerName: string;
  notes: string[];
  imageCount: number;
}): string {
  const cleaned = input.notes.map((n) => n.trim()).filter(Boolean);
  const bullets = cleaned.slice(0, 8).map((n) => `• ${n}`);
  const photoLine =
    input.imageCount > 0
      ? `• ${input.imageCount} progress photo(s) on file`
      : "• No progress photos attached";
  return [
    `Progress summary — ${input.jobTitle} (${input.customerName})`,
    photoLine,
    ...(bullets.length ? bullets : ["• Crew notes pending"]),
  ].join("\n");
}
