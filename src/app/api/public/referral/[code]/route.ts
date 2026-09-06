import { NextResponse } from "next/server";
import { z } from "zod";
import { live } from "@/lib/events";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { newId, nowIso, readStore, updateStoreAsync } from "@/lib/store";
import { dispatchWebhooks } from "@/lib/webhooks";
import { onLeadCreated } from "@/lib/workflows";
import type { Lead } from "@/lib/types";

type RouteParams = { params: Promise<{ code: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteParams) {
  const { code } = await params;
  const data = await readStore();
  const referrer = data.leads.find((l) => l.referralCode === code.toUpperCase());
  if (!referrer) return NextResponse.json({ error: "Unknown referral code" }, { status: 404 });
  return NextResponse.json({ ok: true, referrerFirstName: referrer.name.split(/\s+/)[0] });
}

/** Referred person submits their details → new lead (source "Referral · <name>"), workflows fire. */
export async function POST(request: Request, { params }: RouteParams) {
  const { code } = await params;
  const rl = checkRateLimit({ key: `referral:${clientIp(request)}`, limit: 10, windowMs: 3_600_000 });
  if (!rl.ok) return NextResponse.json({ error: "Too many submissions" }, { status: 429 });
  const parsed = z
    .object({ name: z.string().min(2), phone: z.string().min(7), email: z.string().optional(), address: z.string().optional(), city: z.string().optional(), details: z.string().optional(), jobType: z.enum(["residential", "commercial"]).optional() })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Name and phone required" }, { status: 400 });
  let lead: Lead | null = null;
  await updateStoreAsync(async (d) => {
    const referrer = d.leads.find((l) => l.referralCode === code.toUpperCase());
    if (!referrer) return;
    const stamp = nowIso();
    lead = {
      id: newId(),
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email ?? "",
      address: parsed.data.address ?? "TBD",
      city: parsed.data.city ?? "Halifax",
      source: `Referral · ${referrer.name}`,
      status: "new",
      jobType: parsed.data.jobType ?? "residential",
      notes: parsed.data.details ?? "",
      assignedToId: referrer.assignedToId,
      companyId: null,
      leadScore: 85,
      createdAt: stamp,
      updatedAt: stamp,
      referredByCode: referrer.referralCode,
    };
    d.leads.unshift(lead);
    onLeadCreated(d, lead);
    d.activities.unshift({ id: newId(), type: "task", subject: `Call referral from ${referrer.name}: ${lead.name}`, body: parsed.data.details ?? "", relatedType: "lead", relatedId: lead.id, authorId: referrer.assignedToId ?? "emp-admin", dueAt: stamp, completedAt: null, createdAt: stamp });
    live.lead(`Referral lead: ${lead.name}`, `referred by ${referrer.name}`, { leadId: lead.id });
    await dispatchWebhooks(d, "lead.created", { leadId: lead.id, name: lead.name, source: lead.source }, newId, nowIso);
  });
  if (!lead) return NextResponse.json({ error: "Unknown referral code" }, { status: 404 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
