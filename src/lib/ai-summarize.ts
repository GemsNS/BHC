/**
 * AI / local summarizer for job progress notes.
 * Uses OpenAI-compatible chat API when OPENAI_API_KEY is set; otherwise a local heuristic.
 */

export async function summarizeProgress(input: {
  jobTitle: string;
  customerName: string;
  notes: string[];
  imageCount: number;
}): Promise<{ summary: string; source: "ai" | "local" }> {
  const blob = input.notes.filter(Boolean).join("\n• ");
  const local = buildLocalSummary(input);

  const key = process.env.OPENAI_API_KEY;
  if (!key) return { summary: local, source: "local" };

  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You summarize field crew job progress for a contracting company. Be concise, professional, and suitable for customer-facing job reports. Use short bullet points. Mention photo count if provided. Do not invent facts.",
          },
          {
            role: "user",
            content: `Job: ${input.jobTitle}\nCustomer: ${input.customerName}\nPhotos attached: ${input.imageCount}\nCrew notes:\n• ${blob || "(none)"}`,
          },
        ],
      }),
    });
    if (!res.ok) return { summary: local, source: "local" };
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) return { summary: local, source: "local" };
    return { summary: text, source: "ai" };
  } catch {
    return { summary: local, source: "local" };
  }
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
