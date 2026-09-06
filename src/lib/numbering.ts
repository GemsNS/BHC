import type { AppData } from "./types";

/**
 * Human-readable sequential numbers: Q-2026-0007, INV-2026-0012, JOB-2026-0003,
 * CON-2026-0002, RPT-2026-0009. Derived from what is already in the store so
 * no separate counter has to be kept in sync.
 */

export type NumberKind = "quote" | "invoice" | "job" | "contract" | "report" | "receipt";

const PREFIX: Record<NumberKind, string> = {
  quote: "Q",
  invoice: "INV",
  job: "JOB",
  contract: "CON",
  report: "RPT",
  receipt: "RCPT",
};

function existingNumbers(data: AppData, kind: NumberKind): string[] {
  switch (kind) {
    case "quote":
      return data.quotes.map((q) => q.number);
    case "invoice":
      return data.invoices.map((i) => i.number ?? "");
    case "job":
      return data.jobs.map((j) => j.number ?? "");
    default:
      return data.documents.filter((d) => d.kind === (kind === "report" ? "job_report" : kind)).map((d) => d.number);
  }
}

export function nextNumber(data: AppData, kind: NumberKind, now = new Date()): string {
  const year = now.getFullYear();
  const prefix = `${PREFIX[kind]}-${year}-`;
  let max = 0;
  for (const n of existingNumbers(data, kind)) {
    if (!n || !n.startsWith(prefix)) continue;
    const seq = Number(n.slice(prefix.length));
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** Backfill numbers on records created before numbering existed (idempotent). */
export function ensureNumbers(data: AppData): number {
  let changed = 0;
  for (const j of [...data.jobs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!j.number) {
      j.number = nextNumber(data, "job", new Date(j.createdAt));
      changed += 1;
    }
  }
  for (const i of [...data.invoices].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!i.number) {
      i.number = nextNumber(data, "invoice", new Date(i.createdAt));
      changed += 1;
    }
  }
  return changed;
}

/** URL-safe random token for public links. */
export function publicToken(newId: () => string): string {
  return `${newId().replace(/-/g, "")}${newId().replace(/-/g, "").slice(0, 8)}`;
}
