import type { AppData, WebhookEventName } from "./types";

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

export async function dispatchWebhooks(
  data: AppData,
  event: WebhookEventName,
  payload: Record<string, unknown>,
  newId: () => string,
  nowIso: () => string,
): Promise<void> {
  const endpoints = data.webhookEndpoints.filter(
    (e) => e.enabled && e.events.includes(event),
  );
  for (const endpoint of endpoints) {
    const body = JSON.stringify({
      event,
      occurredAt: nowIso(),
      data: payload,
    });
    const signature = await signWebhookPayload(endpoint.secret, body);
    let status: "ok" | "failed" = "failed";
    let lastError: string | null = null;
    try {
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BHC-Event": event,
          "X-BHC-Signature": `sha256=${signature}`,
        },
        body,
      });
      status = res.ok ? "ok" : "failed";
      if (!res.ok) lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "network error";
    }
    data.webhookDeliveries.unshift({
      id: newId(),
      endpointId: endpoint.id,
      event,
      payload,
      status,
      attempts: 1,
      lastError,
      createdAt: nowIso(),
    });
    if (data.webhookDeliveries.length > 200) data.webhookDeliveries.length = 200;
  }
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
];
