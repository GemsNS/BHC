import { NextResponse } from "next/server";
import { requireApiEmployee } from "@/lib/api-auth";
import { appBaseUrl, clearQbConnection } from "@/lib/quickbooks-oauth";

/** Clear stored QuickBooks tokens (POST with session, or GET for Intuit disconnect URL). */
export async function POST(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  await clearQbConnection();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  await clearQbConnection();
  return NextResponse.redirect(`${appBaseUrl()}/admin/books?qb=disconnected`);
}
