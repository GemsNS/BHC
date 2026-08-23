import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import type { CrmActivity, Deal, ServiceTicket } from "@/lib/types";

export async function GET(request: Request) {
  const data = await readStore();
  const url = new URL(request.url);
  const relatedType = url.searchParams.get("relatedType");
  const relatedId = url.searchParams.get("relatedId");

  let activities = [...data.activities].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  if (relatedType && relatedId) {
    activities = activities.filter(
      (a) => a.relatedType === relatedType && a.relatedId === relatedId,
    );
  }

  return NextResponse.json({
    companies: data.companies,
    deals: data.deals,
    activities,
    leads: data.leads,
    employees: data.employees,
  });
}

const activitySchema = z.object({
  type: z.enum(["call", "email", "meeting", "note", "task"]),
  subject: z.string().min(1),
  body: z.string().optional(),
  relatedType: z.enum(["lead", "deal", "company", "ticket", "job"]),
  relatedId: z.string(),
  authorId: z.string(),
  dueAt: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();

  if (body.action === "create_deal") {
    const stamp = nowIso();
    const deal: Deal = {
      id: newId(),
      title: z.string().parse(body.title),
      leadId: body.leadId ?? null,
      companyId: body.companyId ?? null,
      stage: z
        .enum([
          "discovery",
          "proposal",
          "negotiation",
          "closed_won",
          "closed_lost",
        ])
        .parse(body.stage ?? "discovery"),
      amount: Number(body.amount ?? 0),
      closeDate: body.closeDate ?? null,
      ownerId: body.ownerId ?? null,
      notes: body.notes ?? "",
      createdAt: stamp,
      updatedAt: stamp,
    };
    await updateStore((data) => {
      data.deals.unshift(deal);
    });
    return NextResponse.json({ deal }, { status: 201 });
  }

  if (body.action === "create_ticket") {
    const stamp = nowIso();
    const ticket: ServiceTicket = {
      id: newId(),
      subject: z.string().parse(body.subject),
      description: body.description ?? "",
      status: "new",
      priority: z
        .enum(["low", "medium", "high", "urgent"])
        .parse(body.priority ?? "medium"),
      contactName: body.contactName ?? "",
      contactEmail: body.contactEmail ?? "",
      assigneeId: body.assigneeId ?? null,
      leadId: body.leadId ?? null,
      companyId: body.companyId ?? null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    await updateStore((data) => {
      data.tickets.unshift(ticket);
    });
    return NextResponse.json({ ticket }, { status: 201 });
  }

  const parsed = activitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const stamp = nowIso();
  const activity: CrmActivity = {
    id: newId(),
    type: parsed.data.type,
    subject: parsed.data.subject,
    body: parsed.data.body ?? "",
    relatedType: parsed.data.relatedType,
    relatedId: parsed.data.relatedId,
    authorId: parsed.data.authorId,
    dueAt: parsed.data.dueAt ?? null,
    completedAt: parsed.data.type === "task" ? null : stamp,
    createdAt: stamp,
  };

  await updateStore((data) => {
    data.activities.unshift(activity);
  });

  return NextResponse.json({ activity }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();

  if (body.dealId) {
    let updated: Deal | null = null;
    await updateStore((data) => {
      const deal = data.deals.find((d) => d.id === body.dealId);
      if (!deal) return;
      if (body.stage) deal.stage = body.stage;
      if (body.amount != null) deal.amount = Number(body.amount);
      deal.updatedAt = nowIso();
      updated = deal;
    });
    if (!updated) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    return NextResponse.json({ deal: updated });
  }

  if (body.ticketId) {
    let updated: ServiceTicket | null = null;
    await updateStore((data) => {
      const ticket = data.tickets.find((t) => t.id === body.ticketId);
      if (!ticket) return;
      if (body.status) ticket.status = body.status;
      if (body.assigneeId !== undefined) ticket.assigneeId = body.assigneeId;
      ticket.updatedAt = nowIso();
      updated = ticket;
    });
    if (!updated) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    return NextResponse.json({ ticket: updated });
  }

  return NextResponse.json({ error: "Invalid patch" }, { status: 400 });
}
