"use client";

import { format, parseISO } from "date-fns";
import type { Employee, Shift } from "@/lib/types";
import {
  employeeName,
  formatShiftTime,
  weekRange,
} from "@/lib/shifts";
import { StatusBadge } from "./StatusBadge";

function shiftClass(status: Shift["status"]): string {
  switch (status) {
    case "open_pool":
      return "cc-shift-pool";
    case "overtime":
      return "cc-shift-ot";
    case "claimed":
      return "cc-shift-claimed";
    default:
      return "cc-shift-scheduled";
  }
}

export function ShiftWeekGrid({
  shifts,
  employees,
  anchor,
  onSelectShift,
}: {
  shifts: Shift[];
  employees: Employee[];
  anchor: Date;
  onSelectShift?: (shift: Shift) => void;
}) {
  const { days } = weekRange(anchor);

  const activeEmployees = employees.filter((e) => e.active);

  return (
    <div className="cc-schedule-grid overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--line)]">
            <th className="px-3 py-2 text-xs uppercase text-[var(--muted)]">
              Team member
            </th>
            {days.map((day) => (
              <th
                key={day.toISOString()}
                className="px-2 py-2 text-xs uppercase text-[var(--muted)]"
              >
                {format(day, "EEE M/d")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[var(--line)] bg-[var(--panel)]/40">
            <td className="px-3 py-2 font-medium text-amber-300">Open pool / OT</td>
            {days.map((day) => {
              const dayShifts = shifts.filter(
                (s) =>
                  (s.status === "open_pool" ||
                    (s.status === "overtime" && !s.claimedById)) &&
                  format(parseISO(s.startAt), "yyyy-MM-dd") ===
                    format(day, "yyyy-MM-dd"),
              );
              return (
                <td key={day.toISOString()} className="px-1 py-1 align-top">
                  {dayShifts.map((s) => (
                    <ShiftChip
                      key={s.id}
                      shift={s}
                      onClick={onSelectShift}
                    />
                  ))}
                </td>
              );
            })}
          </tr>
          {activeEmployees.map((emp) => (
            <tr key={emp.id} className="border-b border-[var(--line)]">
              <td className="px-3 py-2 font-medium">{emp.name}</td>
              {days.map((day) => {
                const dayShifts = shifts.filter(
                  (s) =>
                    (s.employeeId === emp.id || s.claimedById === emp.id) &&
                    format(parseISO(s.startAt), "yyyy-MM-dd") ===
                      format(day, "yyyy-MM-dd"),
                );
                return (
                  <td key={day.toISOString()} className="px-1 py-1 align-top">
                    {dayShifts.map((s) => (
                      <ShiftChip
                        key={s.id}
                        shift={s}
                        onClick={onSelectShift}
                      />
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShiftChip({
  shift,
  onClick,
}: {
  shift: Shift;
  onClick?: (shift: Shift) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(shift)}
      className={`mb-1 block w-full rounded-md border px-2 py-1 text-left text-xs ${shiftClass(shift.status)}`}
    >
      <span className="block font-semibold">{shift.title}</span>
      <span className="block opacity-80">{formatShiftTime(shift)}</span>
      {shift.location ? (
        <span className="block truncate opacity-70">{shift.location}</span>
      ) : null}
    </button>
  );
}

export function ShiftList({
  shifts,
  employees,
  emptyLabel = "No shifts",
  onClaim,
  claimable,
}: {
  shifts: Shift[];
  employees: Employee[];
  emptyLabel?: string;
  onClaim?: (shiftId: string) => void;
  claimable?: boolean;
}) {
  if (!shifts.length) {
    return <p className="text-sm text-[var(--muted)]">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-3">
      {shifts.map((shift) => {
        const canClaim =
          claimable &&
          (shift.status === "open_pool" ||
            (shift.status === "overtime" && !shift.claimedById));
        return (
          <li
            key={shift.id}
            className={`rounded-lg border border-[var(--line)] p-4 ${shiftClass(shift.status)}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{shift.title}</p>
                <p className="text-sm opacity-80">{formatShiftTime(shift)}</p>
                {shift.location ? (
                  <p className="text-sm opacity-70">{shift.location}</p>
                ) : null}
                <p className="mt-1 text-xs opacity-70">
                  {employeeName(employees, shift.employeeId ?? shift.claimedById)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge status={shift.status} />
                {shift.isOvertime ? (
                  <span className="text-xs font-semibold text-amber-300">
                    Overtime
                  </span>
                ) : null}
                {canClaim && onClaim ? (
                  <button
                    type="button"
                    onClick={() => onClaim(shift.id)}
                    className="rounded-md bg-[var(--amber)] px-3 py-1 text-xs font-semibold text-[var(--ink)]"
                  >
                    Claim shift
                  </button>
                ) : null}
              </div>
            </div>
            {shift.notes ? (
              <p className="mt-2 text-sm opacity-75">{shift.notes}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function ActivityTimeline({
  activities,
  employees,
}: {
  activities: import("@/lib/types").CrmActivity[];
  employees: Employee[];
}) {
  if (!activities.length) {
    return <p className="text-sm text-[var(--muted)]">No activity yet.</p>;
  }

  return (
    <ol className="space-y-3 border-l border-[var(--line)] pl-4">
      {activities.map((act) => (
        <li key={act.id} className="relative">
          <span className="absolute -left-[1.35rem] top-1 h-2 w-2 rounded-full bg-[var(--amber)]" />
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            {act.type} ·{" "}
            {employees.find((e) => e.id === act.authorId)?.name ?? act.authorId}{" "}
            · {format(parseISO(act.createdAt), "MMM d, h:mm a")}
          </p>
          <p className="font-medium">{act.subject}</p>
          {act.body ? <p className="text-sm text-[var(--muted)]">{act.body}</p> : null}
        </li>
      ))}
    </ol>
  );
}
