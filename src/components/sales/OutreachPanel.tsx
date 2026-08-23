"use client";

import { useEffect, useState } from "react";
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

export function OutreachPanel() {
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
    void refresh();
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
              body: `[Outreach] ${item.message}`,
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
    <ul className="jarvis-panel-stack">
      {queue.map((item) => (
        <li key={item.id} className="jarvis-glass-panel">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <p className="font-semibold">{item.prospectName}</p>
              <p className="text-sm text-[var(--muted)]">{item.prospectEmail}</p>
              <p className="mt-2 font-medium">{item.subject}</p>
              <p className="text-sm text-[var(--muted)]">{item.message}</p>
            </div>
            <StatusBadge status={item.status} />
          </div>
          {item.status === "pending_approval" || item.status === "approved" ? (
            <div className="mt-3 flex gap-2">
              {item.status === "pending_approval" ? (
                <button type="button" className="btn-secondary !py-1 !text-xs" onClick={() => act(item.id, "approve")}>
                  Approve
                </button>
              ) : null}
              <button type="button" className="btn-primary !py-1 !text-xs" onClick={() => act(item.id, "send")}>
                Mark sent
              </button>
              <button type="button" className="linkish text-xs" onClick={() => act(item.id, "cancel")}>
                Cancel
              </button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
