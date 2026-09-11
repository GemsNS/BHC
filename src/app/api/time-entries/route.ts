import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiEmployee } from "@/lib/api-auth";
import { canViewPayroll, sanitizeEmployeeForClient } from "@/lib/store-client";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import {
  autoCloseOverLimitPunches,
  formatDuration,
  isPunchOverLimit,
  LUNCH_DEDUCT_MINUTES,
  MAX_SHIFT_MS,
  openPunchFor,
  paidDurationMs,
  msToHours,
} from "@/lib/time-clock";
import type { TimeEntry } from "@/lib/types";

async function sweepOverLimit() {
  await updateStore((data) => {
    autoCloseOverLimitPunches(data.timeEntries);
  });
}

export async function GET(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;

  await sweepOverLimit();
  const data = await readStore();
  const payroll = canViewPayroll(employee.role);
  const visibleEntries = payroll
    ? data.timeEntries
    : data.timeEntries.filter((t) => t.employeeId === employee.id);
  const mine = data.timeEntries.filter((t) => t.employeeId === employee.id);
  const open = openPunchFor(data.timeEntries, employee.id);
  const paidTodayMs = mine
    .filter((t) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      return new Date(t.clockIn).getTime() >= day.getTime();
    })
    .reduce((s, t) => s + paidDurationMs(t.clockIn, t.clockOut), 0);

  return NextResponse.json({
    timeEntries: visibleEntries,
    employees: data.employees.map((e) =>
      sanitizeEmployeeForClient(e, {
        hideRate: !payroll && e.id !== employee.id,
      }),
    ),
    jobs: data.jobs,
    me: {
      employeeId: employee.id,
      clockedIn: Boolean(open),
      openEntry: open,
      paidHoursToday: msToHours(paidTodayMs),
      lunchDeductMinutes: LUNCH_DEDUCT_MINUTES,
      maxShiftHours: MAX_SHIFT_MS / 3_600_000,
    },
  });
}

export async function POST(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;

  await sweepOverLimit();

  const body = await request.json();
  const action = z.enum(["clock_in", "clock_out"]).parse(body.action);
  // Always bind to the authenticated employee — ignore spoofed body ids
  const employeeId = employee.id;

  if (action === "clock_in") {
    const jobId = z.string().nullable().optional().parse(body.jobId) ?? null;
    const notes = z.string().optional().parse(body.notes) ?? "";

    let entry: TimeEntry | null = null;
    let error: string | null = null;

    await updateStore((data) => {
      autoCloseOverLimitPunches(data.timeEntries);
      const open = data.timeEntries.find(
        (t) => t.employeeId === employeeId && t.clockOut === null,
      );
      if (open) {
        if (isPunchOverLimit(open.clockIn, null)) {
          // Should have been closed by sweep; force-close then allow new punch
          open.clockOut = new Date(
            new Date(open.clockIn).getTime() + MAX_SHIFT_MS,
          ).toISOString();
          open.notes = open.notes?.trim()
            ? `${open.notes}\nAuto clock-out at 12-hour limit — clock in again to continue work.`
            : "Auto clock-out at 12-hour limit — clock in again to continue work.";
        } else {
          error = "Already clocked in";
          return;
        }
      }
      entry = {
        id: newId(),
        employeeId,
        clockIn: nowIso(),
        clockOut: null,
        jobId,
        notes,
      };
      data.timeEntries.unshift(entry);
    });

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }
    return NextResponse.json(
      {
        entry,
        rules: {
          lunchDeductMinutes: LUNCH_DEDUCT_MINUTES,
          maxShiftHours: 12,
          note: `Shifts auto-close at 12 hours. A ${LUNCH_DEDUCT_MINUTES}-minute lunch is deducted from paid time.`,
        },
      },
      { status: 201 },
    );
  }

  let entry: TimeEntry | null = null;
  let paidHours = 0;
  await updateStore((data) => {
    autoCloseOverLimitPunches(data.timeEntries);
    const open = data.timeEntries.find(
      (t) => t.employeeId === employeeId && t.clockOut === null,
    );
    if (!open) return;
    open.clockOut = nowIso();
    entry = open;
    paidHours = msToHours(paidDurationMs(open.clockIn, open.clockOut));
  });

  if (!entry) {
    return NextResponse.json(
      { error: "No open time entry — clock in first" },
      { status: 400 },
    );
  }
  const closed: TimeEntry = entry;
  return NextResponse.json({
    entry: closed,
    paidHours,
    paidLabel: formatDuration(paidDurationMs(closed.clockIn, closed.clockOut)),
    lunchDeductMinutes: LUNCH_DEDUCT_MINUTES,
  });
}
