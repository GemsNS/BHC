import { NextResponse } from "next/server";
import { z } from "zod";
import type { WebhookEventName } from "@/lib/types";
import { ALL_WEBHOOK_EVENTS } from "@/lib/webhooks";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    endpoints: data.webhookEndpoints,
    deliveries: data.webhookDeliveries.slice(0, 50),
    events: ALL_WEBHOOK_EVENTS,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = z
    .object({
      name: z.string().min(1),
      url: z.string().url(),
      events: z.array(z.string()).optional(),
    })
    .parse(body);
  const endpoint = {
    id: newId(),
    name: parsed.name,
    url: parsed.url,
    secret: newId().replace(/-/g, ""),
    events: (parsed.events as WebhookEventName[] | undefined) ?? ["pin.created", "proposal.signed"],
    enabled: true,
    createdAt: nowIso(),
  };
  await updateStore((data) => {
    data.webhookEndpoints.unshift(endpoint);
  });
  return NextResponse.json({ endpoint }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const id = z.string().parse(body.id);
  await updateStore((data) => {
    const e = data.webhookEndpoints.find((x) => x.id === id);
    if (!e) return;
    if (body.enabled != null) e.enabled = Boolean(body.enabled);
    if (body.url) e.url = String(body.url);
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await updateStore((data) => {
    data.webhookEndpoints = data.webhookEndpoints.filter((e) => e.id !== id);
  });
  return NextResponse.json({ ok: true });
}
