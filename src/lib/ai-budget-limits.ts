/**
 * Client-safe AI budget / agent loop limits (no Node fs).
 * Server ledger lives in ai-budget.ts.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export type AiBudgetLimits = {
  dailyRequests: number;
  dailyTokens: number;
  perEmployeeDaily: number;
  maxSteps: number;
  maxMessageChars: number;
  maxHistoryMessages: number;
};

export function getAiBudgetLimits(): AiBudgetLimits {
  return {
    dailyRequests: envInt("AI_DAILY_REQUEST_LIMIT", 200),
    dailyTokens: envInt("AI_DAILY_TOKEN_BUDGET", 500_000),
    perEmployeeDaily: envInt("AI_EMPLOYEE_DAILY_REQUEST_LIMIT", 80),
    maxSteps: envInt("AI_MAX_STEPS", 6),
    maxMessageChars: envInt("AI_MAX_MESSAGE_CHARS", 12_000),
    maxHistoryMessages: envInt("AI_MAX_HISTORY_MESSAGES", 24),
  };
}
