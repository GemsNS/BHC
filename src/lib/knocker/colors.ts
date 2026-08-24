import type { CanvassOutcome, KnockColorCode } from "@/lib/types";

export const DEFAULT_KNOCK_COLORS: KnockColorCode[] = [
  { id: "color-not-home", outcome: "not_home", label: "Not Home", hex: "#94a3b8", stroke: "#64748b" },
  { id: "color-interested", outcome: "interested", label: "Interested", hex: "#22c55e", stroke: "#16a34a" },
  { id: "color-pitched", outcome: "pitched", label: "Gave Pitch", hex: "#3b82f6", stroke: "#2563eb" },
  { id: "color-appointment", outcome: "appointment", label: "Appointment", hex: "#a855f7", stroke: "#9333ea" },
  { id: "color-sold", outcome: "sold", label: "Sold", hex: "#fbbf24", stroke: "#f59e0b" },
  { id: "color-callback", outcome: "callback", label: "Call Back", hex: "#f97316", stroke: "#ea580c" },
  { id: "color-not-interested", outcome: "not_interested", label: "Not Interested", hex: "#71717a", stroke: "#52525b" },
  { id: "color-dnk", outcome: "do_not_knock", label: "Do Not Knock", hex: "#ef4444", stroke: "#dc2626" },
];

export function colorForOutcome(
  outcome: CanvassOutcome,
  codes: KnockColorCode[] = DEFAULT_KNOCK_COLORS,
): KnockColorCode {
  return codes.find((c) => c.outcome === outcome) ?? codes[0];
}
