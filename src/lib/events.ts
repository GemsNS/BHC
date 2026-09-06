/**
 * Live event wire — everything the system does gets a line here.
 *
 * Pure in-memory ring buffer + optional sinks. Safe to import anywhere
 * (browser demo included). The server registers a JSONL file sink in
 * `instrumentation.ts`, and `GET /api/stream` pushes new events to the UI.
 */

export type LiveEventLevel = "info" | "success" | "warn" | "error" | "ai" | "out" | "in";

export type LiveEventKind =
  | "tick"
  | "automation"
  | "ad"
  | "outreach"
  | "reply"
  | "lead"
  | "job"
  | "invoice"
  | "payment"
  | "document"
  | "webhook"
  | "ai"
  | "discovery"
  | "message"
  | "call"
  | "system"
  | "auth";

export interface LiveEvent {
  id: string;
  at: string;
  kind: LiveEventKind;
  level: LiveEventLevel;
  title: string;
  detail?: string;
  /** Links to records, e.g. { leadId, jobId, adId } */
  refs?: Record<string, string | null | undefined>;
  /** Where it came from: scheduler, api, console, ui, webhook */
  source?: string;
}

type Sink = (event: LiveEvent) => void;

const RING = 500;
const KEY = Symbol.for("bhc.events");

type State = { buffer: LiveEvent[]; seq: number; sinks: Sink[]; counters: Record<string, number> };

function state(): State {
  const g = globalThis as unknown as Record<symbol, State | undefined>;
  if (!g[KEY]) g[KEY] = { buffer: [], seq: 0, sinks: [], counters: {} };
  return g[KEY]!;
}

function rid(): string {
  const s = state();
  s.seq += 1;
  return `${Date.now().toString(36)}-${s.seq.toString(36)}`;
}

export function emitEvent(input: Omit<LiveEvent, "id" | "at"> & { at?: string }): LiveEvent {
  const s = state();
  const event: LiveEvent = { id: rid(), at: input.at ?? new Date().toISOString(), ...input };
  s.buffer.push(event);
  if (s.buffer.length > RING) s.buffer.splice(0, s.buffer.length - RING);
  s.counters[event.kind] = (s.counters[event.kind] ?? 0) + 1;
  for (const sink of s.sinks) {
    try {
      sink(event);
    } catch {
      /* sinks never break the caller */
    }
  }
  return event;
}

export function addEventSink(sink: Sink): () => void {
  const s = state();
  s.sinks.push(sink);
  return () => {
    s.sinks = s.sinks.filter((x) => x !== sink);
  };
}

/** Events newer than `afterId` (or the most recent `limit` when no cursor). */
export function recentEvents(opts: { afterId?: string | null; limit?: number } = {}): LiveEvent[] {
  const s = state();
  const limit = opts.limit ?? 100;
  if (opts.afterId) {
    const idx = s.buffer.findIndex((e) => e.id === opts.afterId);
    if (idx >= 0) return s.buffer.slice(idx + 1);
  }
  return s.buffer.slice(-limit);
}

export function eventCounters(): Record<string, number> {
  return { ...state().counters };
}

/** Replace the buffer (used when the server rehydrates from the JSONL file on boot). */
export function seedEvents(events: LiveEvent[]) {
  const s = state();
  s.buffer = events.slice(-RING);
  for (const e of s.buffer) s.counters[e.kind] = (s.counters[e.kind] ?? 0) + 1;
}

/* Convenience emitters — keep call sites one-liners */

export const live = {
  tick: (title: string, detail?: string, source?: string) =>
    emitEvent({ kind: "tick", level: "info", title, detail, source }),
  automation: (title: string, detail?: string, level: LiveEventLevel = "info") =>
    emitEvent({ kind: "automation", level, title, detail, source: "engine" }),
  ad: (title: string, detail?: string, refs?: LiveEvent["refs"], level: LiveEventLevel = "in") =>
    emitEvent({ kind: "ad", level, title, detail, refs }),
  discovery: (title: string, detail?: string, level: LiveEventLevel = "ai") =>
    emitEvent({ kind: "discovery", level, title, detail, source: "engine" }),
  outreach: (title: string, detail?: string, refs?: LiveEvent["refs"], level: LiveEventLevel = "out") =>
    emitEvent({ kind: "outreach", level, title, detail, refs }),
  reply: (title: string, detail?: string, refs?: LiveEvent["refs"]) =>
    emitEvent({ kind: "reply", level: "success", title, detail, refs }),
  lead: (title: string, detail?: string, refs?: LiveEvent["refs"]) =>
    emitEvent({ kind: "lead", level: "success", title, detail, refs }),
  job: (title: string, detail?: string, refs?: LiveEvent["refs"]) =>
    emitEvent({ kind: "job", level: "info", title, detail, refs }),
  invoice: (title: string, detail?: string, refs?: LiveEvent["refs"]) =>
    emitEvent({ kind: "invoice", level: "info", title, detail, refs }),
  payment: (title: string, detail?: string, refs?: LiveEvent["refs"]) =>
    emitEvent({ kind: "payment", level: "success", title, detail, refs }),
  document: (title: string, detail?: string, refs?: LiveEvent["refs"]) =>
    emitEvent({ kind: "document", level: "out", title, detail, refs }),
  webhook: (title: string, detail?: string, level: LiveEventLevel = "out") =>
    emitEvent({ kind: "webhook", level, title, detail }),
  ai: (title: string, detail?: string) => emitEvent({ kind: "ai", level: "ai", title, detail }),
  message: (title: string, detail?: string, refs?: LiveEvent["refs"], level: LiveEventLevel = "in") =>
    emitEvent({ kind: "message", level, title, detail, refs }),
  call: (title: string, detail?: string, refs?: LiveEvent["refs"]) =>
    emitEvent({ kind: "call", level: "in", title, detail, refs }),
  system: (title: string, detail?: string, level: LiveEventLevel = "info") =>
    emitEvent({ kind: "system", level, title, detail }),
  error: (kind: LiveEventKind, title: string, detail?: string) =>
    emitEvent({ kind, level: "error", title, detail }),
};
