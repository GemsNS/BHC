import type { AppData, WebhookDelivery, WebhookEventName } from "./types";

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signWebhookPayload(
  secret: string,
  body: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return toHex(sig);
}

/** Max delivery attempts before a webhook is abandoned. */
export const WEBHOOK_MAX_ATTEMPTS = 5;
/** Base backoff (5 min) — doubles each attempt: 5m, 10m, 20m, 40m. */
export const WEBHOOK_BACKOFF_BASE_MS = 5 * 60_000;
const DELIVERY_LOG_CAP = 200;

export function webhookBackoffMs(attempts: number): number {
  return WEBHOOK_BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1);
}

type Fetcher = typeof fetch;

export type WebhookSendOutcome = {
  ok: boolean;
  error: string | null;
};

async function sendOnce(
  url: string,
  secret: string,
  event: WebhookEventName,
  payload: Record<string, unknown>,
  occurredAt: string,
  deliveryId: string,
  attempt: number,
  fetcher: Fetcher,
): Promise<WebhookSendOutcome> {
  const body = JSON.stringify({ event, occurredAt, data: payload });
  const signature = await signWebhookPayload(secret, body);
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 10_000) : null;
    const res = await fetcher(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BHC-Event": event,
        "X-BHC-Signature": `sha256=${signature}`,
        "X-BHC-Delivery": deliveryId,
        "X-BHC-Attempt": String(attempt),
      },
      body,
      signal: controller?.signal,
    });
    if (timer) clearTimeout(timer);
    return { ok: res.ok, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

function capLog(data: AppData) {
  if (data.webhookDeliveries.length > DELIVERY_LOG_CAP) {
    data.webhookDeliveries.length = DELIVERY_LOG_CAP;
  }
}

function applyOutcome(
  delivery: WebhookDelivery,
  outcome: WebhookSendOutcome,
  nowMs: number,
  nowIso: () => string,
) {
  delivery.attempts += 1;
  if (outcome.ok) {
    delivery.status = "ok";
    delivery.lastError = null;
    delivery.nextRetryAt = null;
    delivery.completedAt = nowIso();
    return;
  }
  delivery.status = "failed";
  delivery.lastError = outcome.error;
  if (delivery.attempts >= WEBHOOK_MAX_ATTEMPTS) {
    delivery.nextRetryAt = null;
    delivery.completedAt = nowIso();
  } else {
    delivery.nextRetryAt = new Date(nowMs + webhookBackoffMs(delivery.attempts)).toISOString();
  }
}

/**
 * Queue a webhook for every subscribed endpoint **without** sending.
 * Safe to call from synchronous code (workflow actions, client-side demo).
 * The scheduler / `deliverPendingWebhooks` performs the actual POST.
 */
export function queueWebhook(
  data: AppData,
  event: WebhookEventName,
  payload: Record<string, unknown>,
  newId: () => string,
  nowIso: () => string,
): WebhookDelivery[] {
  const endpoints = data.webhookEndpoints.filter(
    (e) => e.enabled && e.events.includes(event),
  );
  const created: WebhookDelivery[] = [];
  for (const endpoint of endpoints) {
    const delivery: WebhookDelivery = {
      id: newId(),
      endpointId: endpoint.id,
      event,
      payload,
      status: "pending",
      attempts: 0,
      lastError: null,
      createdAt: nowIso(),
      nextRetryAt: nowIso(),
      completedAt: null,
    };
    data.webhookDeliveries.unshift(delivery);
    created.push(delivery);
  }
  capLog(data);
  return created;
}

/**
 * Send immediately to every subscribed endpoint. Failures are logged with a
 * `nextRetryAt` so the retry loop picks them up.
 */
export async function dispatchWebhooks(
  data: AppData,
  event: WebhookEventName,
  payload: Record<string, unknown>,
  newId: () => string,
  nowIso: () => string,
  fetcher: Fetcher = fetch,
): Promise<WebhookDelivery[]> {
  const queued = queueWebhook(data, event, payload, newId, nowIso);
  if (!queued.length) return [];
  await deliverPendingWebhooks(data, nowIso, { fetcher, onlyIds: queued.map((d) => d.id) });
  return queued;
}

export type DeliverOptions = {
  fetcher?: Fetcher;
  now?: number;
  /** Restrict to specific delivery ids (used by dispatchWebhooks) */
  onlyIds?: string[];
  /** Max deliveries per call (protects a tick from a huge backlog) */
  limit?: number;
};

export type DeliverResult = { sent: number; failed: number; abandoned: number };

/**
 * Deliver every `pending` delivery and every `failed` delivery whose
 * `nextRetryAt` has passed. Exponential backoff, max 5 attempts.
 */
export async function deliverPendingWebhooks(
  data: AppData,
  nowIso: () => string,
  opts: DeliverOptions = {},
): Promise<DeliverResult> {
  const fetcher = opts.fetcher ?? fetch;
  const nowMs = opts.now ?? Date.now();
  const limit = opts.limit ?? 50;
  const only = opts.onlyIds ? new Set(opts.onlyIds) : null;
  const result: DeliverResult = { sent: 0, failed: 0, abandoned: 0 };

  const due = data.webhookDeliveries.filter((d) => {
    if (only && !only.has(d.id)) return false;
    if (d.status === "ok") return false;
    if (d.attempts >= WEBHOOK_MAX_ATTEMPTS) return false;
    if (d.status === "pending") return true;
    return !!d.nextRetryAt && new Date(d.nextRetryAt).getTime() <= nowMs;
  });

  for (const delivery of due.slice(0, limit)) {
    const endpoint = data.webhookEndpoints.find((e) => e.id === delivery.endpointId);
    if (!endpoint || !endpoint.enabled) {
      delivery.status = "failed";
      delivery.lastError = endpoint ? "endpoint disabled" : "endpoint removed";
      delivery.nextRetryAt = null;
      delivery.completedAt = nowIso();
      result.abandoned += 1;
      continue;
    }
    const outcome = await sendOnce(
      endpoint.url,
      endpoint.secret,
      delivery.event,
      delivery.payload,
      delivery.createdAt,
      delivery.id,
      delivery.attempts + 1,
      fetcher,
    );
    applyOutcome(delivery, outcome, nowMs, nowIso);
    if (outcome.ok) result.sent += 1;
    else if (delivery.attempts >= WEBHOOK_MAX_ATTEMPTS) result.abandoned += 1;
    else result.failed += 1;
  }
  return result;
}

/** Deliveries waiting for a retry (failed but not abandoned) plus pending. */
export function webhookBacklog(data: AppData): WebhookDelivery[] {
  return data.webhookDeliveries.filter(
    (d) => d.status !== "ok" && d.attempts < WEBHOOK_MAX_ATTEMPTS && (d.status === "pending" || d.nextRetryAt),
  );
}

export const ALL_WEBHOOK_EVENTS: WebhookEventName[] = [
  "pin.created",
  "pin.updated",
  "proposal.created",
  "proposal.signed",
  "todo.created",
  "todo.completed",
  "territory.created",
  "automation.ran",
  "lead.created",
  "lead.status_changed",
  "job.created",
  "job.status_changed",
  "invoice.status_changed",
  "damage.reported",
  "ticket.created",
  "workflow.ran",
  "automation.tick",
];
