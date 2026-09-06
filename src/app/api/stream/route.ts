import { eventCounters, recentEvents } from "@/lib/events";
import { schedulerInfo } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events feed of the live wire. Auth handled by middleware
 * (session cookie). Sends a backlog first, then pushes new events every
 * ~1.5s and a heartbeat every 15s.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  let cursor: string | null = url.searchParams.get("after") || request.headers.get("last-event-id");
  const backlog = Math.min(200, Number(url.searchParams.get("backlog") ?? "80") || 80);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown, id?: string) => {
        if (closed) return;
        const payload = `${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          closed = true;
        }
      };

      send("hello", { at: new Date().toISOString(), scheduler: schedulerInfo(), counters: eventCounters() });
      const initial = recentEvents({ afterId: cursor, limit: backlog });
      for (const e of initial) send("event", e, e.id);
      if (initial.length) cursor = initial[initial.length - 1].id;

      const poll = setInterval(() => {
        const fresh = recentEvents({ afterId: cursor, limit: 100 });
        if (!cursor && fresh.length) fresh.splice(0, fresh.length - 1); // no cursor → only newest
        for (const e of fresh) send("event", e, e.id);
        if (fresh.length) cursor = fresh[fresh.length - 1].id;
      }, 1500);
      const beat = setInterval(() => send("heartbeat", { at: new Date().toISOString(), scheduler: schedulerInfo(), counters: eventCounters() }), 15_000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(poll);
        clearInterval(beat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
