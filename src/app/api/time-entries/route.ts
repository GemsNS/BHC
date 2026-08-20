import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import type { TimeEntry } from "@/lib/types";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    timeEntries: data.timeEntries,
    employees: data.employees,
    jobs: data.jobs,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const action = z.enum(["clock_in", "clock_out"]).parse(body.action);
  const employeeId = z.string().parse(body.employeeId);

  if (action === "clock_in") {
    const jobId = z.string().nullable().optional().parse(body.jobId) ?? null;
    const notes = z.string().optional().parse(body.notes) ?? "";

    let entry: TimeEntry | null = null;
    let error: string | null = null;

    await updateStore((data) => {
      const open = data.timeEntries.find(
        (t) => t.employeeId === employeeId && t.clockOut === null,
      );
      if (open) {
        error = "Already clocked in";
        return;
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
    return NextResponse.json({ entry }, { status: 201 });
  }

  let entry: TimeEntry | null = null;
  await updateStore((data) => {
    const open = data.timeEntries.find(
      (t) => t.employeeId === employeeId && t.clockOut === null,
    );
    if (!open) return;
    open.clockOut = nowIso();
    entry = open;
  });

  if (!entry) {
    return NextResponse.json(
      { error: "No open time entry for employee" },
      { status: 400 },
    );
  }
  return NextResponse.json({ entry });
}
