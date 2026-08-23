import {
  addDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfWeek,
} from "date-fns";
import type { Employee, Shift } from "./types";

export function weekRange(anchor = new Date()) {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  const end = endOfWeek(anchor, { weekStartsOn: 1 });
  return { start, end, days: eachDayOfInterval({ start, end }) };
}

export function shiftHours(shift: Shift): number {
  const ms =
    parseISO(shift.endAt).getTime() - parseISO(shift.startAt).getTime();
  return Math.max(0, ms / (1000 * 60 * 60));
}

export function formatShiftTime(shift: Shift): string {
  const s = parseISO(shift.startAt);
  const e = parseISO(shift.endAt);
  return `${format(s, "EEE h:mm a")} – ${format(e, "h:mm a")}`;
}

export function shiftsForDay(shifts: Shift[], day: Date): Shift[] {
  return shifts.filter((sh) => isSameDay(parseISO(sh.startAt), day));
}

export function openPoolShifts(shifts: Shift[]): Shift[] {
  return shifts.filter(
    (s) => s.status === "open_pool" || (s.status === "overtime" && !s.claimedById),
  );
}

export function myShifts(shifts: Shift[], employeeId: string): Shift[] {
  return shifts.filter(
    (s) =>
      s.employeeId === employeeId ||
      s.claimedById === employeeId,
  );
}

export function shiftStatusLabel(status: Shift["status"]): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "open_pool":
      return "Open pool";
    case "claimed":
      return "Claimed";
    case "overtime":
      return "Overtime";
    default:
      return status;
  }
}

export function employeeName(
  employees: Employee[],
  id: string | null,
): string {
  if (!id) return "Unassigned";
  return employees.find((e) => e.id === id)?.name ?? id;
}

export function navigateWeek(anchor: Date, delta: number): Date {
  return addDays(anchor, delta * 7);
}
