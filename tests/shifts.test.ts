import { describe, expect, it } from "vitest";
import { buildSeedData } from "../src/lib/seed";
import { myShifts, openPoolShifts, shiftHours } from "../src/lib/shifts";

describe("shifts", () => {
  it("lists open pool and overtime unclaimed shifts", () => {
    const data = buildSeedData();
    const pool = openPoolShifts(data.shifts);
    expect(pool.some((s) => s.status === "open_pool")).toBe(true);
    expect(pool.some((s) => s.isOvertime)).toBe(true);
  });

  it("filters shifts for an employee", () => {
    const data = buildSeedData();
    const mine = myShifts(data.shifts, "emp-field-1");
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((s) => s.employeeId === "emp-field-1" || s.claimedById === "emp-field-1")).toBe(true);
  });

  it("computes shift duration in hours", () => {
    const data = buildSeedData();
    const shift = data.shifts[0];
    expect(shiftHours(shift)).toBe(8);
  });
});
