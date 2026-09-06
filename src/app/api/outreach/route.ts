import { NextResponse } from "next/server";
import { z } from "zod";
import { processOutreachQueue, sendPolicy } from "@/lib/outreach-send";
import { serverSenders } from "@/lib/scheduler";
import { newId, nowIso, readStore, updateStore, updateStoreAsync } from "@/lib/store";
import type { OutreachQueueItem, OutreachStatus } from "@/lib/types";

export async function GET() {
  const data = await readStore();
  const queue = [...data.outreachQueue].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  return NextResponse.json({ queue, leads: data.leads });
}

export async function POST(request: Request) {
  const body = await request.json();
  const action = z.enum(["approve", "send", "cancel"]).parse(body.action);
  const id = z.string().parse(body.id);

  // Real delivery when a sender is configured for the channel; else legacy "mark sent".
  if (action === "send") {
    const senders = serverSenders();
    let target: OutreachQueueItem | undefined;
    let delivered = false;
    await updateStoreAsync(async (data) => {
      target = data.outreachQueue.find((o) => o.id === id);
      if (!target) return;
      const canSend =
        (target.channel === "email" && senders.email && target.prospectEmail) ||
        (target.channel === "sms" && senders.sms && target.prospectPhone);
      if (!canSend) return;
      target.status = "approved";
      const others = data.outreachQueue.filter((o) => o.id !== id && o.status === "approved");
      for (const o of others) o.status = "queued";
      await processOutreachQueue(data, { newId, nowIso }, senders, { ...sendPolicy(), quietStart: 0, quietEnd: 0 });
      for (const o of others) o.status = "approved";
      delivered = data.outreachQueue.find((o) => o.id === id)?.status === "sent";
    });
    if (!target) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (delivered || target.status === "failed") {
      return NextResponse.json({ item: target, delivered }, { status: delivered ? 200 : 502 });
    }
    // fall through to legacy mark-as-sent when no sender is configured
  }

  let updated: OutreachQueueItem | null = null;
  await updateStore((data) => {
    const item = data.outreachQueue.find((o) => o.id === id);
    if (!item) return;
    const stamp = nowIso();

    if (action === "approve") {
      item.status = "approved";
    } else if (action === "send") {
      item.status = "sent";
      item.sentAt = stamp;
      if (item.leadId) {
        data.activities.unshift({
          id: `act-out-${Date.now()}`,
          type: "email",
          subject: item.subject,
          body: `[Autonomous outreach — ${item.channel}] ${item.message}`,
          relatedType: "lead",
          relatedId: item.leadId,
          authorId: "emp-sales-1",
          dueAt: null,
          completedAt: stamp,
          createdAt: stamp,
        });
      }
    } else {
      item.status = "cancelled";
    }
    updated = item;
  });

  if (!updated) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  return NextResponse.json({ item: updated });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const id = z.string().parse(body.id);
  const status = z
    .enum([
      "queued",
      "pending_approval",
      "approved",
      "sent",
      "failed",
      "cancelled",
    ])
    .parse(body.status) as OutreachStatus;

  let updated: OutreachQueueItem | null = null;
  await updateStore((data) => {
    const item = data.outreachQueue.find((o) => o.id === id);
    if (!item) return;
    item.status = status;
    updated = item;
  });

  if (!updated) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  return NextResponse.json({ item: updated });
}
