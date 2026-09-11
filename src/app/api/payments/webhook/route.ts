import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook — permanently disabled (card pay cut from workflow).
 * Keep the route so old Dashboard endpoints get a clear 410 instead of applying payments.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Stripe is disabled. Use e-Transfer or record a manual payment.",
      stripe: false,
    },
    { status: 410 },
  );
}

export async function GET() {
  return NextResponse.json({
    ok: false,
    stripe: false,
    message: "Stripe webhook disabled — card checkout removed from workflow.",
  });
}
