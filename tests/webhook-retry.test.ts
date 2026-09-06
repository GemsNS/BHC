import { describe, expect, it } from "vitest";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { normalizeStore } from "../src/lib/normalize";
import {
  WEBHOOK_MAX_ATTEMPTS,
  deliverPendingWebhooks,
  dispatchWebhooks,
  queueWebhook,
  webhookBackoffMs,
  webhookBacklog,
} from "../src/lib/webhooks";
import type { AppData } from "../src/lib/types";

let n = 0;
const newId = () => `wh-${++n}`;
const nowIso = () => new Date().toISOString();

function withEndpoint(): AppData {
  const data = normalizeStore(buildDemoSeedData());
  data.webhookEndpoints = [
    {
      id: "ep-1",
      name: "Zapier",
      url: "https://hooks.example.test/bhc",
      secret: "s3cret",
      events: ["lead.created", "job.status_changed", "automation.tick"],
      enabled: true,
      createdAt: nowIso(),
    },
  ];
  data.webhookDeliveries = [];
  return data;
}

function fetcherWith(statuses: number[]): { fetcher: typeof fetch; calls: Array<{ url: string; headers: Record<string, string> }> } {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  let i = 0;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const status = statuses[Math.min(i, statuses.length - 1)];
    i += 1;
    calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
    if (status === 0) throw new Error("ECONNREFUSED");
    return new Response("", { status });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe("webhook queue + retry", () => {
  it("queueWebhook creates a pending delivery per subscribed endpoint only", () => {
    const data = withEndpoint();
    expect(queueWebhook(data, "lead.created", { leadId: "l1" }, newId, nowIso)).toHaveLength(1);
    expect(queueWebhook(data, "pin.created", { knockId: "k1" }, newId, nowIso)).toHaveLength(0);
    expect(data.webhookDeliveries[0].status).toBe("pending");
    expect(webhookBacklog(data)).toHaveLength(1);
  });

  it("dispatchWebhooks signs and delivers immediately", async () => {
    const data = withEndpoint();
    const { fetcher, calls } = fetcherWith([200]);
    const out = await dispatchWebhooks(data, "lead.created", { leadId: "l1" }, newId, nowIso, fetcher);
    expect(out).toHaveLength(1);
    expect(calls[0].headers["X-BHC-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(calls[0].headers["X-BHC-Event"]).toBe("lead.created");
    expect(calls[0].headers["X-BHC-Attempt"]).toBe("1");
    expect(data.webhookDeliveries[0].status).toBe("ok");
    expect(data.webhookDeliveries[0].completedAt).toBeTruthy();
    expect(webhookBacklog(data)).toHaveLength(0);
  });

  it("schedules exponential backoff on failure and abandons after max attempts", async () => {
    const data = withEndpoint();
    const { fetcher, calls } = fetcherWith([500]);
    const start = Date.now();
    await dispatchWebhooks(data, "job.status_changed", { jobId: "j1" }, newId, nowIso, fetcher);
    const d = data.webhookDeliveries[0];
    expect(d.status).toBe("failed");
    expect(d.attempts).toBe(1);
    expect(d.lastError).toBe("HTTP 500");
    expect(new Date(d.nextRetryAt!).getTime()).toBeGreaterThanOrEqual(start + webhookBackoffMs(1) - 1000);

    // Not yet due → nothing sent
    const early = await deliverPendingWebhooks(data, nowIso, { fetcher, now: start + 60_000 });
    expect(early.sent + early.failed).toBe(0);
    expect(calls).toHaveLength(1);

    // Walk through retries until abandoned
    let t = start;
    for (let attempt = 2; attempt <= WEBHOOK_MAX_ATTEMPTS; attempt++) {
      t = new Date(d.nextRetryAt!).getTime() + 1000;
      await deliverPendingWebhooks(data, nowIso, { fetcher, now: t });
      expect(d.attempts).toBe(attempt);
    }
    expect(d.nextRetryAt).toBeNull();
    expect(d.completedAt).toBeTruthy();
    expect(webhookBacklog(data)).toHaveLength(0);
    expect(calls).toHaveLength(WEBHOOK_MAX_ATTEMPTS);
    expect(calls.at(-1)!.headers["X-BHC-Attempt"]).toBe(String(WEBHOOK_MAX_ATTEMPTS));
  });

  it("network errors are retried and eventually succeed", async () => {
    const data = withEndpoint();
    const { fetcher } = fetcherWith([0, 200]);
    await dispatchWebhooks(data, "lead.created", {}, newId, nowIso, fetcher);
    const d = data.webhookDeliveries[0];
    expect(d.status).toBe("failed");
    expect(d.lastError).toBe("ECONNREFUSED");
    const r = await deliverPendingWebhooks(data, nowIso, {
      fetcher,
      now: new Date(d.nextRetryAt!).getTime() + 1,
    });
    expect(r.sent).toBe(1);
    expect(d.status).toBe("ok");
    expect(d.attempts).toBe(2);
  });

  it("abandons deliveries whose endpoint was disabled or removed", async () => {
    const data = withEndpoint();
    queueWebhook(data, "lead.created", {}, newId, nowIso);
    data.webhookEndpoints[0].enabled = false;
    const { fetcher, calls } = fetcherWith([200]);
    const r = await deliverPendingWebhooks(data, nowIso, { fetcher });
    expect(r.abandoned).toBe(1);
    expect(calls).toHaveLength(0);
    expect(data.webhookDeliveries[0].lastError).toBe("endpoint disabled");
  });

  it("backoff doubles per attempt", () => {
    expect(webhookBackoffMs(1)).toBe(5 * 60_000);
    expect(webhookBackoffMs(2)).toBe(10 * 60_000);
    expect(webhookBackoffMs(4)).toBe(40 * 60_000);
  });
});
