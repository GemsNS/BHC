"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
  clientNewId,
  clientNowIso,
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { OutreachQueueItem } from "@/lib/types";

export default function OutreachPage() {
  const [queue, setQueue] = useState<OutreachQueueItem[]>([]);

  async function refresh() {
    const d = await loadAppData();
    setQueue(d.outreachQueue);
    if (!isStaticDemo()) {
      try {
        const json = await fetchJson<{ queue: OutreachQueueItem[] }>(
          "/api/outreach",
        );
        setQueue(json.queue);
      } catch {
        /* local */
      }
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function act(id: string, action: "approve" | "send" | "cancel") {
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        const item = d.outreachQueue.find((o) => o.id === id);
        if (!item) return;
        const stamp = clientNowIso();
        if (action === "approve") item.status = "approved";
        else if (action === "send") {
          item.status = "sent";
          item.sentAt = stamp;
          if (item.leadId) {
            d.activities.unshift({
              id: clientNewId(),
              type: "email",
              subject: item.subject,
              body: `[Autonomous outreach] ${item.message}`,
              relatedType: "lead",
              relatedId: item.leadId,
              authorId: "emp-sales-1",
              dueAt: null,
              completedAt: stamp,
              createdAt: stamp,
            });
          }
        } else item.status = "cancelled";
      });
    } else {
      await fetchJson("/api/outreach", {
        method: "POST",
        body: JSON.stringify({ action, id }),
      });
    }
    await refresh();
  }

  return (
    <div>
      <PageHeader
        title="Outreach queue"
        subtitle="Autonomous lead generation drafts — approve before send (demo logs until email provider is connected)."
      />

      <ul className="space-y-4">
        {queue.map((item) => (
          <li
            key={item.id}
            className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{item.prospectName}</p>
                <p className="text-sm text-[var(--muted)]">
                  {item.prospectEmail} · {item.channel}
                </p>
                <p className="mt-2 text-sm font-medium">{item.subject}</p>
                <p className="text-sm text-[var(--muted)]">{item.message}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            {item.status === "pending_approval" || item.status === "approved" ? (
              <div className="mt-3 flex gap-2">
                {item.status === "pending_approval" ? (
                  <button
                    type="button"
                    onClick={() => act(item.id, "approve")}
                    className="rounded-md border border-[var(--line)] px-3 py-1 text-xs"
                  >
                    Approve
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => act(item.id, "send")}
                  className="rounded-md bg-[var(--amber)] px-3 py-1 text-xs font-semibold text-[var(--ink)]"
                >
                  Mark sent (demo)
                </button>
                <button
                  type="button"
                  onClick={() => act(item.id, "cancel")}
                  className="rounded-md px-3 py-1 text-xs text-rose-400"
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
