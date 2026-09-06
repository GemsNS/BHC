import { appendFile, mkdir, readFile } from "fs/promises";
import path from "path";
import { addEventSink, seedEvents, type LiveEvent } from "./events";

/**
 * Server sink: append every event to data/events.jsonl and rehydrate the
 * in-memory ring on boot so the live wire survives restarts.
 */

const KEY = Symbol.for("bhc.events.server");

function eventsPath(): string {
  return path.join(process.cwd(), "data", "events.jsonl");
}

export async function installEventFileSink(): Promise<void> {
  const g = globalThis as unknown as Record<symbol, boolean | undefined>;
  if (g[KEY]) return;
  g[KEY] = true;
  try {
    const raw = await readFile(eventsPath(), "utf8");
    const lines = raw.trim().split("\n").slice(-500);
    const events: LiveEvent[] = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line) as LiveEvent);
      } catch {
        /* skip corrupt line */
      }
    }
    seedEvents(events);
  } catch {
    /* no file yet */
  }
  let queue: string[] = [];
  let flushing = false;
  const flush = async () => {
    if (flushing || !queue.length) return;
    flushing = true;
    const batch = queue.join("");
    queue = [];
    try {
      await mkdir(path.dirname(eventsPath()), { recursive: true });
      await appendFile(eventsPath(), batch, "utf8");
    } catch {
      /* disk issue — memory buffer still works */
    } finally {
      flushing = false;
      if (queue.length) void flush();
    }
  };
  addEventSink((event) => {
    queue.push(JSON.stringify(event) + "\n");
    void flush();
  });
}
