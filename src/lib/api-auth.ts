import { NextResponse } from "next/server";
import { BHC_SESSION_HEADER } from "@/lib/session-headers";
import { readStore } from "@/lib/store";
import type { Employee, EmployeeRole } from "@/lib/types";

/** Resolve active employee from API request header (set by client session). */
export async function getApiEmployee(request: Request): Promise<Employee | null> {
  const id = request.headers.get(BHC_SESSION_HEADER)?.trim();
  if (!id) return null;
  const data = await readStore();
  return data.employees.find((e) => e.id === id && e.active) ?? null;
}

export async function requireApiEmployee(
  request: Request,
): Promise<Employee | NextResponse> {
  const employee = await getApiEmployee(request);
  if (!employee) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return employee;
}

export function hasRole(employee: Employee, roles: EmployeeRole[]): boolean {
  return roles.includes(employee.role);
}

export async function requireApiRole(
  request: Request,
  roles: EmployeeRole[],
): Promise<Employee | NextResponse> {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  if (!hasRole(employee, roles)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return employee;
}
