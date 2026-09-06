import { NextResponse } from "next/server";
import { z } from "zod";
import { companyProfile } from "@/lib/ad-classify";
import { requireApiEmployee } from "@/lib/api-auth";
import { live } from "@/lib/events";
import { sendEmail } from "@/lib/mail";
import { buildThreads, canMessage, draftThreadReply, markThreadRead, recordMessage, threadMessages } from "@/lib/messaging";
import { normalizeAddress } from "@/lib/outreach-send";
import { sendSms, smsConfigStatus } from "@/lib/sms";
import { newId, nowIso, readStore, updateStore, updateStoreAsync } from "@/lib/store";

export async function GET(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const data = await readStore();
  const url = new URL(request.url);
  const key = url.searchParams.get("thread");
  if (key) {
    return NextResponse.json({ thread: key, messages: threadMessages(data, key), lead: data.leads.find((l) => l.id === (threadMessages(data, key).find((m) => m.leadId)?.leadId ?? "")) ?? null });
  }
  const threads = buildThreads(data);
  return NextResponse.json({
    threads,
    unread: threads.reduce((s, t) => s + t.unread, 0),
    voicemails: data.messages.filter((m) => m.channel === "voice" && !m.readAt).slice(0, 20),
    connections: { sms: smsConfigStatus().configured, email: Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY) },
  });
}

const schema = z.object({
  action: z.enum(["send", "draft", "read", "read_voicemail"]),
  thread: z.string().optional(),
  channel: z.enum(["sms", "email"]).optional(),
  to: z.string().optional(),
  body: z.string().optional(),
  subject: z.string().optional(),
  leadId: z.string().nullable().optional(),
  jobId: z.string().nullable().optional(),
  instruction: z.string().optional(),
  id: z.string().optional(),
});

/**
 * POST { action: "send", channel, to, body, subject?, leadId?, jobId? }  → real send + Message
 * POST { action: "draft", thread, instruction? }                          → Claude-drafted reply
 * POST { action: "read", thread }
 */
export async function POST(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const ctx = { newId, nowIso };

  if (body.action === "draft") {
    if (!body.thread) return NextResponse.json({ error: "thread required" }, { status: 400 });
    const data = await readStore();
    const draft = await draftThreadReply(data, body.thread, { instruction: body.instruction });
    return NextResponse.json(draft);
  }
  if (body.action === "read") {
    if (!body.thread) return NextResponse.json({ error: "thread required" }, { status: 400 });
    let n = 0;
    await updateStore((d) => {
      n = markThreadRead(d, body.thread!, ctx);
    });
    return NextResponse.json({ ok: true, marked: n });
  }
  if (body.action === "read_voicemail") {
    await updateStore((d) => {
      const m = d.messages.find((x) => x.id === body.id);
      if (m) m.readAt = nowIso();
    });
    return NextResponse.json({ ok: true });
  }

  if (!body.channel || !body.to || !body.body?.trim()) return NextResponse.json({ error: "channel, to, body required" }, { status: 400 });
  let result: { ok: boolean; error?: string | null; id?: string | null } = { ok: false, error: "not sent" };
  await updateStoreAsync(async (d) => {
    const check = canMessage(d, body.channel!, body.to!);
    if (!check.ok) {
      result = { ok: false, error: check.reason };
      return;
    }
    const lead = body.leadId ? d.leads.find((l) => l.id === body.leadId) : d.leads.find((l) => (body.channel === "sms" ? normalizeAddress("sms", l.phone) === normalizeAddress("sms", body.to!) : l.email.toLowerCase() === body.to!.toLowerCase()));
    const p = companyProfile();
    const r = body.channel === "sms"
      ? await sendSms({ to: body.to!, body: body.body! })
      : await sendEmail({ to: body.to!, subject: body.subject?.trim() || `Message from ${p.name}`, text: body.body! });
    result = { ok: r.ok, error: r.error, id: r.id };
    recordMessage(d, { channel: body.channel!, direction: "out", from: body.channel === "sms" ? smsConfigStatus().from ?? "" : p.email, to: body.to!, subject: body.subject ?? "", body: body.body!, leadId: lead?.id ?? body.leadId ?? null, jobId: body.jobId ?? null, adId: null, provider: r.provider, providerId: r.id, status: r.ok ? "sent" : "failed", recordingUrl: null, transcription: null, durationSec: null }, ctx);
    if (lead && lead.status === "new" && r.ok) {
      lead.status = "contacted";
      lead.updatedAt = nowIso();
    }
    if (r.ok) {
      d.activities.unshift({ id: newId(), type: body.channel === "sms" ? "call" : "email", subject: body.channel === "sms" ? `SMS: ${body.body!.slice(0, 60)}` : body.subject || "Email sent", body: body.body!, relatedType: "lead", relatedId: lead?.id ?? "general", authorId: employee.id, dueAt: null, completedAt: nowIso(), createdAt: nowIso() });
    }
    live.message(`${body.channel!.toUpperCase()} to ${lead?.name ?? body.to}`, r.ok ? body.body!.slice(0, 80) : `failed: ${r.error}`, { leadId: lead?.id }, r.ok ? "out" : "error");
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
