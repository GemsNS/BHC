import { NextResponse } from "next/server";
import { z } from "zod";
import { onShiftPostedPool } from "@/lib/workflows";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import type { Shift, ShiftStatus } from "@/lib/types";

export async function GET(request: Request) {
  const data = await readStore();
  const url = new URL(request.url);
  const employeeId = url.searchParams.get("employeeId");
  const poolOnly = url.searchParams.get("pool") === "1";

  let shifts = [...data.shifts].sort((a, b) =>
    a.startAt.localeCompare(b.startAt),
  );

  if (poolOnly) {
    shifts = shifts.filter(
      (s) =>
        s.status === "open_pool" ||
        (s.status === "overtime" && !s.claimedById),
    );
  } else if (employeeId) {
    shifts = shifts.filter(
      (s) =>
        s.employeeId === employeeId || s.claimedById === employeeId,
    );
  }

  return NextResponse.json({
    shifts,
    employees: data.employees,
    jobs: data.jobs,
  });
}

const createSchema = z.object({
  title: z.string().min(1),
  employeeId: z.string().nullable().optional(),
  startAt: z.string(),
  endAt: z.string(),
  location: z.string().optional(),
  status: z
    .enum(["scheduled", "open_pool", "claimed", "overtime"])
    .optional(),
  isOvertime: z.boolean().optional(),
  jobId: z.string().nullable().optional(),
  notes: z.string().optional(),
  postedById: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();

  if (body.action === "claim") {
    const shiftId = z.string().parse(body.shiftId);
    const employeeId = z.string().parse(body.employeeId);
    let updated: Shift | null = null;

    await updateStore((data) => {
      const shift = data.shifts.find((s) => s.id === shiftId);
      if (!shift) return;
      if (
        shift.status !== "open_pool" &&
        !(shift.status === "overtime" && !shift.claimedById)
      ) {
        return;
      }
      if (shift.claimedById) return;
      const stamp = nowIso();
      shift.claimedById = employeeId;
      shift.claimedAt = stamp;
      shift.employeeId = employeeId;
      shift.status = shift.isOvertime ? "overtime" : "claimed";
      shift.updatedAt = stamp;
      updated = shift;
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Shift unavailable or already claimed" },
        { status: 409 },
      );
    }
    return NextResponse.json({ shift: updated });
  }

  if (body.action === "release") {
    const shiftId = z.string().parse(body.shiftId);
    const postedById = z.string().nullable().optional().parse(body.postedById);

    let updated: Shift | null = null;
    await updateStore((data) => {
      const shift = data.shifts.find((s) => s.id === shiftId);
      if (!shift) return;
      const stamp = nowIso();
      shift.employeeId = null;
      shift.claimedById = null;
      shift.claimedAt = null;
      shift.status = shift.isOvertime ? "overtime" : "open_pool";
      shift.postedById = postedById ?? shift.postedById;
      shift.updatedAt = stamp;
      updated = shift;
      onShiftPostedPool(data, shift, postedById ?? undefined);
    });

    if (!updated) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }
    return NextResponse.json({ shift: updated });
  }

  if (body.action === "publish_pool") {
    const shiftId = z.string().parse(body.shiftId);
    const postedById = z.string().parse(body.postedById);

    let updated: Shift | null = null;
    await updateStore((data) => {
      const shift = data.shifts.find((s) => s.id === shiftId);
      if (!shift) return;
      const stamp = nowIso();
      shift.employeeId = null;
      shift.status = shift.isOvertime ? "overtime" : "open_pool";
      shift.postedById = postedById;
      shift.updatedAt = stamp;
      updated = shift;
      onShiftPostedPool(data, shift, postedById);
    });

    if (!updated) {
      return NextResponse.json({ error: "Shift not found" }, { status: 404 });
    }
    return NextResponse.json({ shift: updated });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const stamp = nowIso();
  const status: ShiftStatus =
    parsed.data.status ??
    (parsed.data.employeeId ? "scheduled" : "open_pool");

  const shift: Shift = {
    id: newId(),
    title: parsed.data.title,
    employeeId: parsed.data.employeeId ?? null,
    startAt: parsed.data.startAt,
    endAt: parsed.data.endAt,
    location: parsed.data.location ?? "",
    status,
    isOvertime: parsed.data.isOvertime ?? status === "overtime",
    postedById:
      status === "open_pool" || status === "overtime"
        ? parsed.data.postedById ?? null
        : null,
    claimedById: null,
    claimedAt: null,
    jobId: parsed.data.jobId ?? null,
    notes: parsed.data.notes ?? "",
    createdAt: stamp,
    updatedAt: stamp,
  };

  await updateStore((data) => {
    data.shifts.unshift(shift);
    if (shift.status === "open_pool" || shift.status === "overtime") {
      onShiftPostedPool(data, shift, parsed.data.postedById ?? undefined);
    }
  });

  return NextResponse.json({ shift }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const id = z.string().parse(body.id);

  let updated: Shift | null = null;
  await updateStore((data) => {
    const shift = data.shifts.find((s) => s.id === id);
    if (!shift) return;
    const stamp = nowIso();
    if (body.title != null) shift.title = String(body.title);
    if (body.employeeId !== undefined)
      shift.employeeId = body.employeeId as string | null;
    if (body.startAt) shift.startAt = String(body.startAt);
    if (body.endAt) shift.endAt = String(body.endAt);
    if (body.location != null) shift.location = String(body.location);
    if (body.notes != null) shift.notes = String(body.notes);
    if (body.status) shift.status = body.status as ShiftStatus;
    shift.updatedAt = stamp;
    updated = shift;
  });

  if (!updated) {
    return NextResponse.json({ error: "Shift not found" }, { status: 404 });
  }
  return NextResponse.json({ shift: updated });
}
