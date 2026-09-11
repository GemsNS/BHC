import { NextResponse } from "next/server";
import { godsEyeEnabled } from "@/lib/gods-eye";
import { enqueueNotification } from "@/lib/notifications";
import { newId, nowIso, updateStoreAsync } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Inbound webhook for a hosted God's Eye View instance.
 *
 * Auth: `x-bhc-gods-eye-secret` header or `?secret=` == GODS_EYE_WEBHOOK_SECRET.
 * When GODS_EYE_ENABLED is off → 503 (integrators should pause).
 *
 * Body (JSON, flexible):
 *   { type, title?, body?, lat?, lng?, url?, meta? }
 */

function secretOk(request: Request): boolean {
  const expected = process.env.GODS_EYE_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  const header = request.headers.get("x-bhc-gods-eye-secret")?.trim();
  const q = new URL(request.url).searchParams.get("secret")?.trim();
  return header === expected || q === expected;
}

export async function POST(request: Request) {
  if (!godsEyeEnabled()) {
    return NextResponse.json(
      { ok: false, error: "God's Eye View is disabled (GODS_EYE_ENABLED=0)." },
      { status: 503 },
    );
  }
  if (!secretOk(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Expected JSON body" }, { status: 400 });
  }

  const type = typeof body.type === "string" && body.type.trim() ? body.type.trim() : "event";
  const title =
    (typeof body.title === "string" && body.title.trim()) || `God's Eye · ${type}`;
  const parts: string[] = [];
  if (typeof body.body === "string" && body.body.trim()) parts.push(body.body.trim());
  if (typeof body.lat === "number" && typeof body.lng === "number") {
    parts.push(`@ ${body.lat.toFixed(5)}, ${body.lng.toFixed(5)}`);
  }
  if (typeof body.url === "string" && body.url.trim()) parts.push(body.url.trim());

  await updateStoreAsync(async (data) => {
    enqueueNotification(
      data,
      {
        employeeId: null,
        title: title.slice(0, 120),
        body: (parts.join(" — ") || type).slice(0, 500),
        href: "/admin/gods-eye",
        dedupeKey: `gods-eye:${type}:${typeof body.url === "string" ? body.url : nowIso().slice(0, 13)}`,
      },
      newId,
      nowIso,
    );
  });

  return NextResponse.json({ ok: true, accepted: type });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    enabled: godsEyeEnabled(),
    webhookConfigured: Boolean(process.env.GODS_EYE_WEBHOOK_SECRET?.trim()),
    path: "/api/gods-eye/webhook",
  });
}
