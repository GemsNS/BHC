import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    vehicles: data.vehicles,
    employees: data.employees,
  });
}
