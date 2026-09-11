import { NextResponse } from "next/server";
import { z } from "zod";
import { invoiceTotal } from "@/lib/customer-touches";
import { live } from "@/lib/events";
import { enqueueNotification } from "@/lib/notifications";
import { invoiceBalance, invoicePayUrl, paymentsStatus } from "@/lib/payments";
import { companyForDocuments, quotePublicUrl, quoteTotals } from "@/lib/quotes";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";

type RouteParams = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

/** Customer job portal (magic link). Photos are served via /api/media (public read for portal viewers happens through this proxy). */
export async function GET(_request: Request, { params }: RouteParams) {
  const { token } = await params;
  const data = await readStore();
  const job = data.jobs.find((j) => j.portalToken === token);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const base = (process.env.APP_BASE_URL ?? "https://bhcontracting.ca").replace(/\/$/, "");
  const c = companyForDocuments();
  const quotes = data.quotes.filter((q) => q.jobId === job.id);
  const invoices = data.invoices.filter((i) => i.jobId === job.id && i.kind === "invoice");
  const progress = data.jobProgress.filter((p) => p.jobId === job.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const documents = data.documents.filter((d) => d.jobId === job.id && d.sentAt);
  const shifts = data.shifts.filter((s) => s.jobId === job.id && new Date(s.startAt).getTime() > Date.now() - 86_400_000).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const crew = job.crewLeadId ? data.employees.find((e) => e.id === job.crewLeadId) : undefined;
  const messages = data.messages.filter((m) => m.jobId === job.id && m.channel !== "voice").sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-30);
  return NextResponse.json(
    {
      job: { number: job.number, title: job.title, status: job.status, address: job.address, startDate: job.startDate, customerName: job.customerName, completedAt: job.completedAt ?? null },
      crewLead: crew ? { name: crew.name, phone: crew.phone } : null,
      company: { name: c.legalName, phone: c.phone, email: c.email, website: c.website, signer: c.signer },
      quotes: quotes.map((q) => ({ number: q.number, status: q.status, total: quoteTotals(q).total, url: quotePublicUrl(q, base), signedAt: q.signedAt })),
      invoices: invoices.map((i) => ({ number: i.number, status: i.status, total: invoiceTotal(i), balance: invoiceBalance(data, i), dueAt: i.dueAt, url: i.token ? invoicePayUrl(i, base) : null })),
      progress: progress.map((p) => ({ id: p.id, createdAt: p.createdAt, notes: p.notes, summary: p.aiSummary, photos: p.imageDataUrls.map((u) => (u.startsWith("/api/media/") ? `/api/public/portal/${token}/media/${u.split("/").pop()}` : u)) })),
      // Only staff-sent JobDocuments — deleting on the job Documents tab removes these immediately.
      documents: documents.map((d) => ({ id: d.id, kind: d.kind, title: d.title, number: d.number, sentAt: d.sentAt, url: `/api/public/portal/${token}/doc/${d.id}` })),
      schedule: shifts.map((s) => ({ title: s.title, startAt: s.startAt, endAt: s.endAt, status: s.status })),
      messages: messages.map((m) => ({ direction: m.direction, channel: m.channel, body: m.body, createdAt: m.createdAt })),
      canPayOnline: paymentsStatus().stripe,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Customer sends a message from the portal → in-app alert + task for the crew lead. */
export async function POST(request: Request, { params }: RouteParams) {
  const { token } = await params;
  const rl = checkRateLimit({ key: `portal-msg:${clientIp(request)}`, limit: 20, windowMs: 3_600_000 });
  if (!rl.ok) return NextResponse.json({ error: "Too many messages" }, { status: 429 });
  const parsed = z.object({ body: z.string().min(1).max(2000) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Message required" }, { status: 400 });
  let ok = false;
  await updateStore((d) => {
    const job = d.jobs.find((j) => j.id && j.portalToken === token);
    if (!job) return;
    ok = true;
    const stamp = nowIso();
    d.messages.unshift({ id: newId(), channel: "email", direction: "in", from: job.customerName, to: "portal", subject: `Portal message — ${job.title}`, body: parsed.data.body, leadId: job.leadId, jobId: job.id, adId: null, provider: "portal", providerId: null, status: "received", readAt: null, recordingUrl: null, transcription: null, durationSec: null, createdAt: stamp });
    d.activities.unshift({ id: newId(), type: "task", subject: `Reply to ${job.customerName} (portal)`, body: parsed.data.body.slice(0, 300), relatedType: "job", relatedId: job.id, authorId: job.crewLeadId ?? "emp-admin", dueAt: stamp, completedAt: null, createdAt: stamp });
    enqueueNotification(d, { employeeId: job.crewLeadId, title: `${job.customerName} sent a message`, body: parsed.data.body.slice(0, 140), href: `/admin/jobs/${job.id}`, dedupeKey: `portal:${job.id}:${stamp.slice(0, 16)}` }, newId, nowIso);
    live.message(`${job.customerName} wrote via the portal`, parsed.data.body.slice(0, 100), { jobId: job.id, leadId: job.leadId ?? undefined });
  });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
