import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export async function GET() {
  const data = await readStore();
  const tickets = [...data.tickets].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  return NextResponse.json({
    tickets,
    employees: data.employees,
    leads: data.leads,
    companies: data.companies,
  });
}
