/**
 * Time-clock rules for BH Contracting field staff.
 *
 * - Paid hours deduct a fixed 30-minute lunch when the punch is longer than 30 minutes.
 * - Open punches auto-close at 12 hours from clock-in; staff must clock in again to continue.
 */

export const LUNCH_DEDUCT_MINUTES = 30;
export const MAX_SHIFT_MS = 12 * 60 * 60 * 1000;
export const LUNCH_DEDUCT_MS = LUNCH_DEDUCT_MINUTES * 60 * 1000;

export type TimePunch = {
  id: string;
  employeeId: string;
  clockIn: string;
  clockOut: string | null;
  jobId: string | null;
  notes: string;
};

export function punchDurationMs(
  clockIn: string,
  clockOut: string | null,
  now = Date.now(),
): number {
  const start = new Date(clockIn).getTime();
  if (!Number.isFinite(start)) return 0;
  const end = clockOut ? new Date(clockOut).getTime() : now;
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

/** Gross elapsed ms capped at the 12h hard stop (for display of open punches). */
export function cappedDurationMs(
  clockIn: string,
  clockOut: string | null,
  now = Date.now(),
): number {
  return Math.min(punchDurationMs(clockIn, clockOut, now), MAX_SHIFT_MS);
}

/**
 * Paid duration after automatic 30-minute lunch deduction.
 * Lunch is only deducted when the (capped) punch is longer than 30 minutes.
 */
export function paidDurationMs(
  clockIn: string,
  clockOut: string | null,
  now = Date.now(),
): number {
  const raw = cappedDurationMs(clockIn, clockOut, now);
  if (raw <= LUNCH_DEDUCT_MS) return raw;
  return Math.max(0, raw - LUNCH_DEDUCT_MS);
}

export function msToHours(ms: number): number {
  return Math.round((ms / 3_600_000) * 100) / 100;
}

export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export function openPunchFor(
  entries: TimePunch[],
  employeeId: string,
): TimePunch | null {
  return entries.find((e) => e.employeeId === employeeId && e.clockOut === null) ?? null;
}

export function isPunchOverLimit(
  clockIn: string,
  clockOut: string | null,
  now = Date.now(),
): boolean {
  if (clockOut) return false;
  return punchDurationMs(clockIn, null, now) >= MAX_SHIFT_MS;
}

/** Timestamp when a 12h open punch should be closed. */
export function autoCloseAtIso(clockIn: string): string {
  return new Date(new Date(clockIn).getTime() + MAX_SHIFT_MS).toISOString();
}

/**
 * Close any open punches that have exceeded 12 hours.
 * Returns how many were closed.
 */
export function autoCloseOverLimitPunches<T extends TimePunch>(
  entries: T[],
  now = Date.now(),
  note = "Auto clock-out at 12-hour limit — clock in again to continue work.",
): { closed: number; entries: T[] } {
  let closed = 0;
  for (const entry of entries) {
    if (entry.clockOut) continue;
    if (!isPunchOverLimit(entry.clockIn, null, now)) continue;
    entry.clockOut = autoCloseAtIso(entry.clockIn);
    const tag = note;
    entry.notes = entry.notes?.trim() ? `${entry.notes}\n${tag}` : tag;
    closed += 1;
  }
  return { closed, entries };
}

export function sumPaidHours(
  entries: TimePunch[],
  employeeId: string | null,
  now = Date.now(),
): number {
  const mine = employeeId
    ? entries.filter((e) => e.employeeId === employeeId)
    : entries;
  return msToHours(
    mine.reduce((sum, e) => sum + paidDurationMs(e.clockIn, e.clockOut, now), 0),
  );
}

export function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfLocalWeek(d = new Date()): Date {
  const x = startOfLocalDay(d);
  const day = x.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  x.setDate(x.getDate() + diff);
  return x;
}
