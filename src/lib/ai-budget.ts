/**
 * AI usage quotas and soft cost controls (local JSON ledger).
 */

import { promises as fs } from "fs";
import path from "path";
import { envInt } from "./rate-limit";

export type AiUsageDay = {
  date: string; // YYYY-MM-DD UTC
  requests: number;
  estimatedTokens: number;
  byProvider: Record<string, number>;
  byEmployee: Record<string, number>;
};

type AiUsageFile = {
  days: AiUsageDay[];
};

function usagePath() {
  return path.join(process.cwd(), "data", "ai-usage.json");
}

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readUsage(): Promise<AiUsageFile> {
  try {
    const raw = await fs.readFile(usagePath(), "utf8");
    return JSON.parse(raw) as AiUsageFile;
  } catch {
    return { days: [] };
  }
}

async function writeUsage(data: AiUsageFile) {
  await fs.mkdir(path.dirname(usagePath()), { recursive: true });
  // Keep last 45 days
  data.days = data.days.slice(-45);
  await fs.writeFile(usagePath(), JSON.stringify(data, null, 2) + "\n", "utf8");
}

function todayBucket(file: AiUsageFile): AiUsageDay {
  const date = utcDate();
  let day = file.days.find((d) => d.date === date);
  if (!day) {
    day = { date, requests: 0, estimatedTokens: 0, byProvider: {}, byEmployee: {} };
    file.days.push(day);
  }
  return day;
}

export function getAiBudgetLimits() {
  return {
    dailyRequests: envInt("AI_DAILY_REQUEST_LIMIT", 200),
    dailyTokens: envInt("AI_DAILY_TOKEN_BUDGET", 500_000),
    perEmployeeDaily: envInt("AI_EMPLOYEE_DAILY_REQUEST_LIMIT", 80),
    maxSteps: envInt("AI_MAX_STEPS", 6),
    maxMessageChars: envInt("AI_MAX_MESSAGE_CHARS", 12_000),
    maxHistoryMessages: envInt("AI_MAX_HISTORY_MESSAGES", 24),
  };
}

export type AiBudgetCheck = {
  ok: boolean;
  reason?: string;
  day: AiUsageDay;
  limits: ReturnType<typeof getAiBudgetLimits>;
};

export async function checkAiBudget(input: {
  employeeId?: string;
  estimatedTokens?: number;
}): Promise<AiBudgetCheck> {
  const limits = getAiBudgetLimits();
  const file = await readUsage();
  const day = todayBucket(file);
  if (day.requests >= limits.dailyRequests) {
    return { ok: false, reason: "Daily AI request quota reached.", day, limits };
  }
  if (day.estimatedTokens >= limits.dailyTokens) {
    return { ok: false, reason: "Daily AI token budget reached.", day, limits };
  }
  if (input.employeeId) {
    const used = day.byEmployee[input.employeeId] ?? 0;
    if (used >= limits.perEmployeeDaily) {
      return {
        ok: false,
        reason: "Your daily AI request quota is reached.",
        day,
        limits,
      };
    }
  }
  return { ok: true, day, limits };
}

export async function recordAiUsage(input: {
  provider: string;
  employeeId?: string;
  estimatedTokens?: number;
}) {
  const file = await readUsage();
  const day = todayBucket(file);
  day.requests += 1;
  day.estimatedTokens += Math.max(0, input.estimatedTokens ?? 800);
  day.byProvider[input.provider] = (day.byProvider[input.provider] ?? 0) + 1;
  if (input.employeeId) {
    day.byEmployee[input.employeeId] = (day.byEmployee[input.employeeId] ?? 0) + 1;
  }
  await writeUsage(file);
  return day;
}

export async function getAiUsageStatus() {
  const file = await readUsage();
  const day = todayBucket(file);
  const limits = getAiBudgetLimits();
  return { day, limits };
}

/** Rough token estimate from text length. */
export function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 4);
}
