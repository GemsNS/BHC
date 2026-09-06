import { NextResponse } from "next/server";
import { z } from "zod";
import type { WebhookEndpoint, WebhookEventName, WebhookFormat } from "@/lib/types";
import {
  ALL_WEBHOOK_EVENTS,
  WEBHOOK_PRESETS,
  deliverPendingWebhooks,
  endpointFromPreset,
  queueWebhook,
  randomWebhookSecret,
  webhookBacklog,
} from "@/lib/webhooks";
import { newId, nowIso, readStore, updateStore, updateStoreAsync } from "@/lib/store";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    endpoints: data.webhookEndpoints.map((e) => ({ ...e, secret: `${e.secret.slice(0, 6)}…` })),
    deliveries: data.webhookDeliveries.slice(0, 50),
    backlog: webhookBacklog(data).length,
    events: ALL_WEBHOOK_EVENTS,
    presets: WEBHOOK_PRESETS,
  });
}

const createSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url(),
  events: z.array(z.string()).optional(),
  format: z.enum(["json", "slack", "discord"]).optional(),
  preset: z.string().optional(),
});

/**
 * POST { url, preset }                 → endpoint from a preset (events + format pre-filled)
 * POST { name, url, events?, format? } → custom endpoint
 * POST { action: "test", id }          → queue + deliver a signed test event to one endpoint
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (body.action === "test") {
    const id = z.string().parse(body.id);
    let delivery: { status: string; lastError: string | null } | null = null;
    await updateStoreAsync(async (d) => {
      const ep = d.webhookEndpoints.find((e) => e.id === id);
      if (!ep) return;
      const event: WebhookEventName = ep.events[0] ?? "automation.ran";
      const [queued] = queueWebhook(
        { ...d, webhookEndpoints: [{ ...ep, enabled: true, events: [event] }] } as typeof d,
        event,
        { test: true, endpoint: ep.name, sentAt: nowIso(), note: "Test delivery from BHC CRM — if you can read this, the webhook works." },
        newId,
        nowIso,
      );
      // queueWebhook wrote into the cloned object's deliveries; copy it into the real store
      if (queued) {
        d.webhookDeliveries.unshift(queued);
        await deliverPendingWebhooks(d, nowIso, { onlyIds: [queued.id] });
        const done = d.webhookDeliveries.find((x) => x.id === queued.id);
        delivery = done ? { status: done.status, lastError: done.lastError } : null;
      }
    });
    if (!delivery) return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
    return NextResponse.json({ ok: (delivery as { status: string }).status === "ok", delivery });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  let endpoint: WebhookEndpoint;
  if (parsed.data.preset) {
    const preset = WEBHOOK_PRESETS.find((p) => p.id === parsed.data.preset);
    if (!preset) return NextResponse.json({ error: `Unknown preset. Options: ${WEBHOOK_PRESETS.map((p) => p.id).join(", ")}` }, { status: 400 });
    endpoint = endpointFromPreset(preset, parsed.data.url, newId, nowIso, parsed.data.name);
    if (parsed.data.events?.length) endpoint.events = parsed.data.events as WebhookEventName[];
    if (parsed.data.format) endpoint.format = parsed.data.format;
  } else {
    const url = parsed.data.url;
    const inferred: WebhookFormat | undefined = /hooks\.slack\.com/.test(url) ? "slack" : /discord(app)?\.com\/api\/webhooks/.test(url) ? "discord" : undefined;
    endpoint = {
      id: newId(),
      name: parsed.data.name ?? new URL(url).hostname,
      url,
      secret: randomWebhookSecret(),
      events: (parsed.data.events as WebhookEventName[] | undefined) ?? ["pin.created", "proposal.signed"],
      enabled: true,
      createdAt: nowIso(),
      format: parsed.data.format ?? inferred ?? "json",
      preset: null,
    };
  }
  await updateStore((data) => {
    data.webhookEndpoints.unshift(endpoint);
  });
  // Secret is returned once, in full, on creation
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
    if (body.name) e.name = String(body.name);
    if (Array.isArray(body.events)) e.events = body.events as WebhookEventName[];
    if (body.format === "json" || body.format === "slack" || body.format === "discord") e.format = body.format;
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
