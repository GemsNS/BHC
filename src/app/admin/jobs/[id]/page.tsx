"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MetricStrip, PageFrame, Panel } from "@/components/cc";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { fetchJson } from "@/lib/client-data";
import type { JobHub } from "@/lib/job-hub";
import type { Quote, QuoteLine } from "@/lib/types";
import { cn, formatCurrency, labelize } from "@/lib/utils";

type HubPayload = JobHub & { employees: Array<{ id: string; name: string; role: string }>; portalUrl: string | null };
type QuoteWithTotals = Quote & { totals: { subtotal: number; tax: number; total: number; deposit: number; balance: number }; publicUrl: string };

function fmt(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}
function fmtDay(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
}

export default function JobHubPage() {
  return (
    <RequireAuth perm="jobs">
      <JobHubInner />
    </RequireAuth>
  );
}

function JobHubInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [hub, setHub] = useState<HubPayload | null>(null);
  const [quotes, setQuotes] = useState<QuoteWithTotals[]>([]);
  const [catalog, setCatalog] = useState<{ products: Array<{ id: string; name: string; unitPrice: number }>; services: Array<{ id: string; name: string; basePrice: number }>; inventory: Array<{ id: string; name: string; unit: string; unitCost: number }> } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "quote" | "money" | "site" | "docs" | "messages" | "timeline">("overview");
  const [editingQuote, setEditingQuote] = useState<QuoteWithTotals | null>(null);
  const [paying, setPaying] = useState<{ invoiceId: string; amount: number; method: string; note: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [h, q] = await Promise.all([fetchJson<HubPayload>(`/api/jobs/${id}`), fetchJson<{ quotes: QuoteWithTotals[]; catalog: typeof catalog }>(`/api/quotes?jobId=${id}`)]);
      setHub(h);
      setQuotes(q.quotes);
      setCatalog(q.catalog);
      setEditingQuote((prev) => (prev ? q.quotes.find((x) => x.id === prev.id) ?? null : null));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load job");
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(label: string, fn: () => Promise<string | void>) {
    setBusy(label);
    setMsg(null);
    setErr(null);
    try {
      const m = await fn();
      if (m) setMsg(m);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const post = <T,>(path: string, body: Record<string, unknown>) => fetchJson<T>(path, { method: "POST", body: JSON.stringify(body) });

  if (!hub) {
    return (
      <PageFrame context="Jobs & delivery" title="Job" subtitle="Loading…">
        <p className="cc-empty">{err ?? "Loading…"}</p>
      </PageFrame>
    );
  }

  const { job, lead, money, checklist, invoices, payments, documents, progress, materials, shifts, damage, activities, messages, ads, signedQuote, crewLead } = hub;
  const done = checklist.filter((c) => c.done).length;

  const metrics = [
    { label: "Contract", value: formatCurrency(money.contractValue), hint: signedQuote ? `signed ${fmtDay(signedQuote.signedAt)}` : "no signed quote", signal: !signedQuote },
    { label: "Invoiced", value: formatCurrency(money.invoiced), hint: `${invoices.length} invoice(s)` },
    { label: "Paid", value: formatCurrency(money.paid), hint: money.outstanding ? `${formatCurrency(money.outstanding)} outstanding` : "nothing owing", signal: money.outstanding > 0 },
    { label: "Margin", value: `${money.marginPct}%`, hint: `${formatCurrency(money.materialCost)} materials · ${money.hours}h labour`, signal: money.marginPct < 25 && money.contractValue > 0 },
    { label: "Checklist", value: `${done}/${checklist.length}`, hint: checklist.find((c) => !c.done)?.label ?? "complete", signal: done < checklist.length },
  ];

  const tabs = [
    ["overview", "Overview"],
    ["quote", `Quote${quotes.length ? ` (${quotes.length})` : ""}`],
    ["money", `Invoices & payments${invoices.length ? ` (${invoices.length})` : ""}`],
    ["site", `Site updates${progress.length ? ` (${progress.length})` : ""}`],
    ["docs", `Documents${documents.length ? ` (${documents.length})` : ""}`],
    ["messages", `Messages${messages.length ? ` (${messages.length})` : ""}`],
    ["timeline", "Timeline"],
  ] as const;

  return (
    <PageFrame
      context={`Jobs & delivery · ${job.number ?? job.id.slice(0, 8)}`}
      title={job.title}
      subtitle={`${job.customerName} · ${job.address}${lead ? ` · ${[lead.phone, lead.email].filter(Boolean).join(" · ")}` : ""}`}
      actions={
        <>
          <select className="field-input !mt-0 !py-1.5 !text-xs" value={job.status} disabled={busy !== null} onChange={(e) => act("status", async () => { await fetchJson(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ status: e.target.value }) }); return `Status → ${labelize(e.target.value)}`; })}>
            {["scheduled", "in_progress", "on_hold", "completed", "invoiced"].map((s) => (
              <option key={s} value={s}>{labelize(s)}</option>
            ))}
          </select>
          {hub.portalUrl ? (
            <a href={hub.portalUrl} target="_blank" rel="noreferrer" className="btn-secondary !py-1.5 !text-xs">Customer portal ↗</a>
          ) : (
            <button type="button" className="btn-secondary !py-1.5 !text-xs" disabled={busy !== null} onClick={() => act("portal", async () => { await fetchJson(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ ensurePortal: true }) }); return "Portal link created."; })}>Create portal link</button>
          )}
          <Link href="/admin/jobs" className="linkish text-xs">All jobs</Link>
        </>
      }
    >
      {msg ? <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{msg}</p> : null}
      {err ? <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{err}</p> : null}
      <MetricStrip items={metrics} />

      <nav className="jarvis-tab-bar" aria-label="Job sections">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" className={cn("jarvis-tab", tab === key && "jarvis-tab-active")} onClick={() => setTab(key)}>{label}</button>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
          <Panel title="Job checklist">
            <ul className="space-y-1.5 text-sm">
              {checklist.map((c) => (
                <li key={c.key} className="flex items-start gap-2">
                  <span className={cn("mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full border", c.done ? "border-emerald-400 bg-emerald-400/30" : "border-white/30")} aria-hidden />
                  <span className={cn(c.done && "text-[var(--muted)] line-through")}>{c.label}</span>
                  {!c.done && c.hint ? <span className="text-xs text-[var(--muted)]">— {c.hint}</span> : null}
                  {!c.done && c.href ? <Link href={c.href} className="linkish text-xs">open</Link> : null}
                </li>
              ))}
            </ul>
          </Panel>
          <div className="grid gap-4">
            <Panel title="Quick actions">
              <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" className="btn-primary !py-1 !text-xs" disabled={busy !== null} onClick={() => act("newquote", async () => { const r = await post<{ quote: QuoteWithTotals }>("/api/quotes", { action: "create", quote: { jobId: id } }); setTab("quote"); setEditingQuote({ ...r.quote, totals: { subtotal: 0, tax: 0, total: 0, deposit: 0, balance: 0 }, publicUrl: "" }); return `Quote ${r.quote.number} created.`; })}>New quote</button>
                <button type="button" className="btn-secondary !py-1 !text-xs" disabled={busy !== null} onClick={() => act("contract", async () => { const r = await post<{ document: { number: string }; delivery: { email: string; sms: string } | null }>("/api/documents", { action: "generate", kind: "contract", jobId: id }); return `Contract ${r.document.number} generated${r.delivery?.email === "sent" ? " and emailed" : ""}.`; })}>Generate contract</button>
                <button type="button" className="btn-secondary !py-1 !text-xs" disabled={busy !== null} onClick={() => act("report", async () => { const r = await post<{ document: { number: string }; delivery: { email: string; sms: string } | null }>("/api/documents", { action: "generate", kind: "job_report", jobId: id }); return `Job report ${r.document.number} generated${r.delivery?.email === "sent" ? " and sent" : ""}.`; })}>Generate job report</button>
                <button type="button" className="btn-secondary !py-1 !text-xs" disabled={busy !== null} onClick={() => act("invoice", async () => { const r = await fetchJson<{ invoice: { id: string } }>("/api/invoices", { method: "POST", body: JSON.stringify({ jobId: id, kind: "invoice", createdById: crewLead?.id ?? "emp-admin", autoLinesFromMaterials: true }) }); await post("/api/documents", { action: "generate", kind: "invoice", invoiceId: r.invoice.id }); setTab("money"); return "Invoice drafted from contract + materials."; })}>Draft final invoice</button>
                <Link href="/admin/schedule" className="btn-secondary !py-1 !text-xs">Schedule crew</Link>
                <Link href="/apps/progress" className="btn-secondary !py-1 !text-xs">Post site update</Link>
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">Documents auto-send when their kind is in <code>DOCS_AUTOSEND</code>; otherwise use Send on the Documents tab.</p>
            </Panel>
            <Panel title="Details">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-[var(--muted)]">Status</dt><dd><StatusBadge status={job.status} /></dd>
                <dt className="text-[var(--muted)]">Type</dt><dd>{job.jobType}</dd>
                <dt className="text-[var(--muted)]">Start</dt><dd>{job.startDate}</dd>
                <dt className="text-[var(--muted)]">Crew lead</dt>
                <dd>
                  <select className="field-input !mt-0 !py-1 !text-xs" value={job.crewLeadId ?? ""} disabled={busy !== null} onChange={(e) => act("crew", async () => { await fetchJson(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ crewLeadId: e.target.value || null }) }); })}>
                    <option value="">Unassigned</option>
                    {hub.employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
                  </select>
                </dd>
                <dt className="text-[var(--muted)]">Lead</dt><dd>{lead ? <Link href="/admin/sales?tab=pipeline" className="linkish">{lead.name} · {lead.source} · {lead.status}</Link> : "—"}</dd>
                {ads.length ? <><dt className="text-[var(--muted)]">Origin ad</dt><dd>{ads.map((a) => <Link key={a.id} href="/admin/ads" className="linkish">{a.title.slice(0, 60)}</Link>)}</dd></> : null}
                <dt className="text-[var(--muted)]">Shifts</dt><dd>{shifts.length ? shifts.map((s) => `${fmtDay(s.startAt)} ${s.title}`).join(" · ") : "none scheduled"}</dd>
                <dt className="text-[var(--muted)]">Materials</dt><dd>{materials.length} line(s) · {formatCurrency(money.materialCost)}</dd>
                {damage.length ? <><dt className="text-[var(--muted)]">Damage</dt><dd className="text-amber-300">{damage.filter((d) => !d.resolved).length} unresolved of {damage.length}</dd></> : null}
                <dt className="text-[var(--muted)]">Notes</dt><dd className="whitespace-pre-wrap text-[var(--muted)]">{job.notes || "—"}</dd>
              </dl>
            </Panel>
          </div>
        </div>
      ) : null}

      {tab === "quote" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
          <Panel title="Quotes" action={<button type="button" className="linkish text-xs" disabled={busy !== null} onClick={() => act("newquote", async () => { const r = await post<{ quote: QuoteWithTotals }>("/api/quotes", { action: "create", quote: { jobId: id } }); return `Quote ${r.quote.number} created.`; })}>New</button>}>
            {quotes.length ? (
              <ul className="space-y-2 text-sm">
                {quotes.map((q) => (
                  <li key={q.id} className={cn("rounded-md border border-white/10 px-3 py-2", editingQuote?.id === q.id && "bg-white/5")}>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" className="text-left font-medium hover:underline" onClick={() => setEditingQuote(q)}>{q.number} · {formatCurrency(q.totals.total)}</button>
                      <StatusBadge status={q.status} />
                    </div>
                    <p className="text-xs text-[var(--muted)]">{q.lines.length} line(s) · deposit {q.depositPercent}% · {q.sentAt ? `sent ${fmt(q.sentAt)}` : "not sent"}{q.viewedAt ? ` · viewed ${fmt(q.viewedAt)}` : ""}{q.signedAt ? ` · signed by ${q.signerName} ${fmt(q.signedAt)}` : ""}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      {q.status !== "signed" ? <button type="button" className="btn-primary !py-0.5 !text-[11px]" disabled={busy !== null} onClick={() => act(`send:${q.id}`, async () => { const r = await post<{ delivery: { email: string; sms: string; errors: string[] } }>("/api/quotes", { action: "send", id: q.id }); return r.delivery.email === "sent" || r.delivery.sms === "sent" ? `Quote sent (${[r.delivery.email === "sent" ? "email" : "", r.delivery.sms === "sent" ? "sms" : ""].filter(Boolean).join("+")}).` : `Not sent: ${r.delivery.errors.join("; ") || "no contact on file"}`; })}>Send for signature</button> : null}
                      <a href={q.publicUrl} target="_blank" rel="noreferrer" className="linkish">Customer link ↗</a>
                      <button type="button" className="linkish" disabled={busy !== null} onClick={() => act(`pdf:${q.id}`, async () => { await post("/api/quotes", { action: "generate_pdf", id: q.id }); return "PDF generated (Documents tab)."; })}>PDF</button>
                      <button type="button" className="linkish" disabled={busy !== null} onClick={() => act(`dup:${q.id}`, async () => { await post("/api/quotes", { action: "duplicate", id: q.id }); return "Duplicated."; })}>Duplicate</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cc-empty">No quotes yet. Create one, add lines from the catalog, then send it for e-signature. Signing creates the deposit invoice automatically.</p>
            )}
          </Panel>
          <Panel title={editingQuote ? `Edit ${editingQuote.number}` : "Quote editor"}>
            {editingQuote ? <QuoteEditor quote={editingQuote} catalog={catalog} disabled={busy !== null || editingQuote.status === "signed"} onSave={(patch) => act("savequote", async () => { await post("/api/quotes", { action: "update", id: editingQuote.id, quote: patch }); return "Quote saved."; })} onAddCatalog={(picks) => act("catalog", async () => { await post("/api/quotes", { action: "add_catalog", id: editingQuote.id, picks }); })} /> : <p className="cc-empty">Select a quote on the left.</p>}
          </Panel>
        </div>
      ) : null}

      {tab === "money" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Invoices">
            {invoices.length ? (
              <ul className="space-y-2 text-sm">
                {invoices.map((inv) => {
                  const total = inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
                  const paid = payments.filter((p) => p.invoiceId === inv.id && p.status === "succeeded").reduce((s, p) => s + p.amount, 0);
                  return (
                    <li key={inv.id} className="rounded-md border border-white/10 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{inv.number ?? inv.id.slice(0, 8)} · {formatCurrency(total)}{paid ? <span className="text-xs text-[var(--muted)]"> · paid {formatCurrency(paid)}</span> : null}</span>
                        <StatusBadge status={inv.status} />
                      </div>
                      <p className="text-xs text-[var(--muted)]">{inv.kind === "full_report" ? "job report" : "invoice"} · {fmtDay(inv.createdAt)}{inv.dueAt ? ` · due ${fmtDay(inv.dueAt)}` : ""}{inv.remindersSent ? ` · ${inv.remindersSent} reminder(s)` : ""}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        <button type="button" className="btn-primary !py-0.5 !text-[11px]" disabled={busy !== null} onClick={() => act(`sendinv:${inv.id}`, async () => { const r = await post<{ delivery: { email: string; sms: string; errors: string[] } }>("/api/documents", { action: "generate", kind: inv.status === "paid" ? "receipt" : "invoice", invoiceId: inv.id, send: true }); return r.delivery.email === "sent" || r.delivery.sms === "sent" ? "Invoice sent with pay link." : `Not sent: ${r.delivery.errors.join("; ") || "no contact on file"}`; })}>{inv.status === "paid" ? "Send receipt" : "Send with pay link"}</button>
                        {inv.status !== "paid" ? <button type="button" className="linkish" onClick={() => setPaying({ invoiceId: inv.id, amount: Math.max(0, total - paid), method: "etransfer", note: "" })}>Record payment</button> : null}
                        <button type="button" className="linkish" disabled={busy !== null} onClick={() => act(`paylink:${inv.id}`, async () => { const r = await post<{ url: string }>("/api/payments", { action: "pay_link", invoiceId: inv.id }); await navigator.clipboard?.writeText(r.url); return `Pay link copied: ${r.url}`; })}>Copy pay link</button>
                        <button type="button" className="linkish" disabled={busy !== null} onClick={() => act(`stripe:${inv.id}`, async () => { const r = await post<{ url: string | null; error: string | null }>("/api/payments", { action: "checkout", invoiceId: inv.id }); if (!r.url) throw new Error(r.error ?? "Stripe not configured"); await navigator.clipboard?.writeText(r.url); return "Stripe checkout link copied."; })}>Stripe link</button>
                      </div>
                      {paying?.invoiceId === inv.id ? (
                        <form className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]" onSubmit={(e: FormEvent) => { e.preventDefault(); act("pay", async () => { await post("/api/payments", { action: "record", invoiceId: inv.id, amount: paying.amount, method: paying.method, note: paying.note }); setPaying(null); return "Payment recorded."; }); }}>
                          <input type="number" step="0.01" className="field-input !mt-0 !py-1 !text-xs" value={paying.amount} onChange={(e) => setPaying({ ...paying, amount: Number(e.target.value) })} />
                          <select className="field-input !mt-0 !py-1 !text-xs" value={paying.method} onChange={(e) => setPaying({ ...paying, method: e.target.value })}>{["etransfer", "cash", "cheque", "stripe", "other"].map((m) => <option key={m} value={m}>{m}</option>)}</select>
                          <input className="field-input !mt-0 !py-1 !text-xs" placeholder="note / reference" value={paying.note} onChange={(e) => setPaying({ ...paying, note: e.target.value })} />
                          <button type="submit" className="btn-primary !py-1 !text-xs" disabled={busy !== null}>Save</button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="cc-empty">No invoices. Signing a quote creates the deposit invoice; use “Draft final invoice” on Overview when the job is done.</p>
            )}
          </Panel>
          <Panel title="Payments">
            {payments.length ? (
              <ul className="space-y-1 text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 rounded bg-white/5 px-2 py-1">
                    <span>{formatCurrency(p.amount)} · {p.method}{p.note ? <span className="text-xs text-[var(--muted)]"> · {p.note}</span> : null}</span>
                    <span className="text-xs text-[var(--muted)]">{fmt(p.receivedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cc-empty">No payments yet. Stripe payments post here automatically; e-Transfers are matched from the mailbox or recorded by hand.</p>
            )}
            <p className="mt-3 text-xs text-[var(--muted)]">Reminders go out automatically at 7, 14 and 30 days for sent invoices (Payment reminders automation).</p>
          </Panel>
        </div>
      ) : null}

      {tab === "site" ? (
        <Panel title="Site updates" action={<Link href="/apps/progress" className="linkish text-xs">Post update</Link>}>
          {progress.length ? (
            <ul className="space-y-3">
              {progress.map((p) => (
                <li key={p.id} className="rounded-md border border-white/10 p-3">
                  <p className="text-xs text-[var(--muted)]">{fmt(p.createdAt)} · {hub.employees.find((e) => e.id === p.authorId)?.name ?? "crew"}</p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{p.notes}</p>
                  {p.aiSummary ? <p className="mt-1 text-xs text-fuchsia-200">AI: {p.aiSummary}</p> : null}
                  {p.imageDataUrls.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {p.imageDataUrls.map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={src} alt="" className="h-24 w-32 rounded object-cover" />
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="cc-empty">No site updates yet. The crew posts photos + notes from the field app; weekly reports are built from them.</p>
          )}
        </Panel>
      ) : null}

      {tab === "docs" ? (
        <Panel title="Documents">
          {documents.length ? (
            <ul className="space-y-2 text-sm">
              {documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 px-3 py-2">
                  <div>
                    <p className="font-medium">{d.title}</p>
                    <p className="text-xs text-[var(--muted)]">{labelize(d.kind)} · {Math.round(d.bytes / 1024)} KB · {fmt(d.createdAt)}{d.sentAt ? ` · sent ${fmt(d.sentAt)} via ${d.sentVia} to ${d.sentTo}` : " · not sent"}</p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <a href={d.fileUrl} target="_blank" rel="noreferrer" className="linkish">Open PDF</a>
                    <button type="button" className="btn-primary !py-0.5 !text-[11px]" disabled={busy !== null} onClick={() => act(`senddoc:${d.id}`, async () => { const r = await post<{ delivery: { email: string; sms: string; errors: string[] } }>("/api/documents", { action: "send", id: d.id }); return r.delivery.email === "sent" || r.delivery.sms === "sent" ? "Sent to customer." : `Not sent: ${r.delivery.errors.join("; ") || "no contact on file"}`; })}>{d.sentAt ? "Resend" : "Send to customer"}</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cc-empty">No documents yet. Quotes, contracts, invoices, receipts and job reports appear here as PDFs.</p>
          )}
        </Panel>
      ) : null}

      {tab === "messages" ? (
        <Panel title="Messages with the customer" action={<Link href="/admin/inbox" className="linkish text-xs">Open inbox</Link>}>
          {messages.length ? (
            <ul className="space-y-2 text-sm">
              {messages.map((m) => (
                <li key={m.id} className={cn("max-w-[80%] rounded-md px-3 py-2", m.direction === "out" ? "ml-auto bg-sky-500/10" : "bg-white/5")}>
                  <p className="text-[11px] text-[var(--muted)]">{m.direction === "out" ? "BHC" : job.customerName} · {m.channel}{m.provider ? ` · ${m.provider}` : ""} · {fmt(m.createdAt)}</p>
                  {m.subject ? <p className="font-medium">{m.subject}</p> : null}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cc-empty">No messages logged for this job yet.</p>
          )}
        </Panel>
      ) : null}

      {tab === "timeline" ? (
        <Panel title="Timeline">
          <ul className="space-y-1 text-sm">
            {activities.map((a) => (
              <li key={a.id} className="flex gap-3 rounded px-2 py-1 hover:bg-white/5">
                <span className="w-28 shrink-0 text-xs text-[var(--muted)]">{fmt(a.createdAt)}</span>
                <span className="w-12 shrink-0 text-xs uppercase text-[var(--muted)]">{a.type}</span>
                <span>{a.subject}{a.type === "task" && !a.completedAt ? <span className="text-amber-300"> (open)</span> : null}<span className="block text-xs text-[var(--muted)]">{a.body.slice(0, 160)}</span></span>
              </li>
            ))}
            {hub.workflowRuns.map((r) => (
              <li key={r.id} className="flex gap-3 rounded px-2 py-1 text-[var(--muted)]">
                <span className="w-28 shrink-0 text-xs">{fmt(r.createdAt)}</span>
                <span className="w-12 shrink-0 text-xs uppercase">auto</span>
                <span className="text-xs">workflow {r.status} · {r.log.join(" · ").slice(0, 160)}</span>
              </li>
            ))}
            {!activities.length && !hub.workflowRuns.length ? <li className="cc-empty">Nothing yet.</li> : null}
          </ul>
        </Panel>
      ) : null}
    </PageFrame>
  );
}

function QuoteEditor({
  quote,
  catalog,
  disabled,
  onSave,
  onAddCatalog,
}: {
  quote: QuoteWithTotals;
  catalog: { products: Array<{ id: string; name: string; unitPrice: number }>; services: Array<{ id: string; name: string; basePrice: number }>; inventory: Array<{ id: string; name: string; unit: string; unitCost: number }> } | null;
  disabled: boolean;
  onSave: (patch: Partial<Quote>) => void;
  onAddCatalog: (picks: Array<{ productId?: string; serviceId?: string; inventoryId?: string; quantity?: number }>) => void;
}) {
  const [form, setForm] = useState<Quote>(quote);
  const [pick, setPick] = useState("");
  useEffect(() => setForm(quote), [quote]);
  const lines = form.lines;
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxable = Math.max(0, subtotal - (form.discount || 0));
  const tax = taxable * form.taxRate;
  const total = taxable + tax;
  const setLine = (i: number, patch: Partial<QuoteLine>) => setForm({ ...form, lines: lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  return (
    <form className="grid gap-3 text-sm" onSubmit={(e) => { e.preventDefault(); onSave({ customerName: form.customerName, customerEmail: form.customerEmail, customerPhone: form.customerPhone, address: form.address, title: form.title, scope: form.scope, lines: form.lines, taxRate: form.taxRate, discount: form.discount, depositPercent: form.depositPercent, notes: form.notes, terms: form.terms, validUntil: form.validUntil }); }}>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="field"><span>Customer</span><input className="field-input" value={form.customerName} disabled={disabled} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></label>
        <label className="field"><span>Project title</span><input className="field-input" value={form.title} disabled={disabled} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label className="field"><span>Email</span><input className="field-input" value={form.customerEmail} disabled={disabled} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} /></label>
        <label className="field"><span>Phone</span><input className="field-input" value={form.customerPhone} disabled={disabled} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} /></label>
        <label className="field md:col-span-2"><span>Address</span><input className="field-input" value={form.address} disabled={disabled} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <label className="field md:col-span-2"><span>Scope of work</span><textarea rows={4} className="field-input" value={form.scope} disabled={disabled} onChange={(e) => setForm({ ...form, scope: e.target.value })} placeholder="Remove existing vinyl siding, inspect sheathing, install house wrap, new Kaycan vinyl siding in Slate Grey, aluminum soffit and fascia…" /></label>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Lines</span>
          <div className="flex gap-2 text-xs">
            {catalog ? (
              <select className="field-input !mt-0 !py-0.5 !text-xs" value={pick} disabled={disabled} onChange={(e) => { const v = e.target.value; setPick(""); if (!v) return; const [kind, cid] = v.split(":"); onAddCatalog([{ [kind === "p" ? "productId" : kind === "s" ? "serviceId" : "inventoryId"]: cid }]); }}>
                <option value="">Add from catalog…</option>
                {catalog.services.map((s) => <option key={s.id} value={`s:${s.id}`}>Service · {s.name} · ${s.basePrice}</option>)}
                {catalog.products.map((p) => <option key={p.id} value={`p:${p.id}`}>Product · {p.name} · ${p.unitPrice}</option>)}
                {catalog.inventory.map((i) => <option key={i.id} value={`i:${i.id}`}>Stock · {i.name} · ${Math.round(i.unitCost * 1.35)}/{i.unit}</option>)}
              </select>
            ) : null}
            <button type="button" className="linkish" disabled={disabled} onClick={() => setForm({ ...form, lines: [...lines, { id: `new-${Date.now()}`, description: "", quantity: 1, unit: "ea", unitPrice: 0, kind: "other" }] })}>+ blank line</button>
          </div>
        </div>
        <div className="grid gap-1">
          {lines.map((l, i) => (
            <div key={l.id} className="grid grid-cols-[1fr_60px_60px_90px_28px] items-center gap-1">
              <input className="field-input !mt-0 !py-1 !text-xs" placeholder="Description" value={l.description} disabled={disabled} onChange={(e) => setLine(i, { description: e.target.value })} />
              <input type="number" step="0.01" className="field-input !mt-0 !py-1 !text-xs" value={l.quantity} disabled={disabled} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} />
              <input className="field-input !mt-0 !py-1 !text-xs" value={l.unit} disabled={disabled} onChange={(e) => setLine(i, { unit: e.target.value })} />
              <input type="number" step="0.01" className="field-input !mt-0 !py-1 !text-xs" value={l.unitPrice} disabled={disabled} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} />
              <button type="button" className="linkish text-xs" disabled={disabled} onClick={() => setForm({ ...form, lines: lines.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        <label className="field"><span>HST rate</span><input type="number" step="0.01" className="field-input" value={form.taxRate} disabled={disabled} onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })} /></label>
        <label className="field"><span>Discount $</span><input type="number" step="0.01" className="field-input" value={form.discount} disabled={disabled} onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })} /></label>
        <label className="field"><span>Deposit %</span><input type="number" className="field-input" value={form.depositPercent} disabled={disabled} onChange={(e) => setForm({ ...form, depositPercent: Number(e.target.value) })} /></label>
        <label className="field"><span>Valid until</span><input type="date" className="field-input" value={form.validUntil?.slice(0, 10) ?? ""} disabled={disabled} onChange={(e) => setForm({ ...form, validUntil: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
      </div>
      <div className="rounded-md bg-white/5 px-3 py-2 text-xs">
        Subtotal {formatCurrency(subtotal)} · HST {formatCurrency(tax)} · <strong>Total {formatCurrency(total)}</strong> · deposit {formatCurrency(total * (form.depositPercent / 100))}
      </div>
      <label className="field"><span>Notes to customer</span><textarea rows={2} className="field-input" value={form.notes} disabled={disabled} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
      <details><summary className="cursor-pointer text-xs text-[var(--muted)]">Terms</summary><textarea rows={6} className="field-input mt-1" value={form.terms} disabled={disabled} onChange={(e) => setForm({ ...form, terms: e.target.value })} /></details>
      {!disabled ? <button type="submit" className="btn-primary !py-1.5 !text-sm">Save quote</button> : <p className="text-xs text-[var(--muted)]">Signed quotes are locked. Duplicate to make changes.</p>}
    </form>
  );
}
