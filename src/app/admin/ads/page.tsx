"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MetricStrip, PageFrame, Panel } from "@/components/cc";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import { ensureBuiltinSource, ingestRawAds } from "@/lib/ad-ingest";
import { qualifyListing } from "@/lib/ad-pipeline";
import { clientNewId, clientNowIso, fetchJson, loadAppData, mutateAppData, mutateAppDataAsync } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { AdListing, AdSource, OutreachQueueItem } from "@/lib/types";
import { cn, labelize } from "@/lib/utils";

type Setup = {
  ai: { configured: boolean; provider: string; model: string | null };
  email: { configured: boolean; provider: string; from: string | null };
  sms: { configured: boolean; provider: string; from: string | null };
  imap: { configured: boolean; host: string | null; user: string | null; folder: string };
  inboundWebhook: boolean;
  autosend: string[];
  autosendMinScore: number;
  dailyCap: number;
  quietHours: string;
  followUpDays: number;
  minScore: number;
  company: { name: string; signer: string; phone: string; email: string };
};

type Payload = {
  sources: AdSource[];
  listings: AdListing[];
  outreach: OutreachQueueItem[];
  setup: Setup | null;
  stats: { total: number; new: number; drafted: number; sent: number; replied: number; pendingApproval: number };
};

type Filter = "attention" | "all" | "new" | "drafted" | "sent" | "replied" | "skipped";

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function scoreTone(score: number): string {
  if (score >= 75) return "text-emerald-300";
  if (score >= 55) return "text-amber-300";
  return "text-stone-400";
}

export default function AdsPage() {
  return (
    <RequireAuth perm="outreach">
      <AdsHub />
    </RequireAuth>
  );
}

function AdsHub() {
  const staticMode = isStaticDemo();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("attention");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, { subject: string; message: string }>>({});
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [testTo, setTestTo] = useState("");

  const refresh = useCallback(async () => {
    setError(null);
    if (!staticMode) {
      try {
        setPayload(await fetchJson<Payload>("/api/ads"));
        return;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load ads");
      }
    }
    const d = await loadAppData();
    const ids = new Set(d.adListings.map((a) => a.id));
    setPayload({
      sources: d.adSources,
      listings: d.adListings,
      outreach: d.outreachQueue.filter((o) => o.adId && ids.has(o.adId)),
      setup: null,
      stats: {
        total: d.adListings.length,
        new: d.adListings.filter((a) => a.status === "new").length,
        drafted: d.adListings.filter((a) => a.status === "drafted" || a.status === "qualified").length,
        sent: d.adListings.filter((a) => a.status === "sent").length,
        replied: d.adListings.filter((a) => a.status === "replied" || a.status === "won").length,
        pendingApproval: d.outreachQueue.filter((o) => o.adId && o.status === "pending_approval").length,
      },
    });
  }, [staticMode]);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(t);
  }, [refresh]);

  async function act(label: string, fn: () => Promise<string | void>) {
    setBusy(label);
    setMessage(null);
    setError(null);
    try {
      const msg = await fn();
      if (msg) setMessage(msg);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  const post = <T,>(body: Record<string, unknown>) =>
    fetchJson<T>("/api/ads", { method: "POST", body: JSON.stringify(body) });

  function ingestNow() {
    return act("ingest", async () => {
      if (staticMode) return "Polling needs the Node host. Paste an ad manually below.";
      const r = await post<{ result: { summary: string } }>({ action: "ingest" });
      return r.result.summary;
    });
  }

  function addManual(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ad = {
      title: String(fd.get("title") ?? ""),
      body: String(fd.get("body") ?? ""),
      url: String(fd.get("url") ?? ""),
      location: String(fd.get("location") ?? ""),
      contactName: String(fd.get("contactName") ?? ""),
      contactEmail: String(fd.get("contactEmail") ?? ""),
      contactPhone: String(fd.get("contactPhone") ?? ""),
    };
    const form = e.currentTarget;
    return act("manual", async () => {
      if (staticMode) {
        await mutateAppDataAsync(async (d) => {
          const src = ensureBuiltinSource(d, "manual", { newId: clientNewId, nowIso: clientNowIso });
          const created = ingestRawAds(d, src, [{ ...ad, postedAt: clientNowIso() }], { newId: clientNewId, nowIso: clientNowIso });
          if (created[0]) await qualifyListing(d, created[0], { newId: clientNewId, nowIso: clientNowIso, ai: false });
        });
      } else {
        await post({ action: "add_manual", ad });
      }
      form.reset();
      setShowManual(false);
      return "Ad added and triaged.";
    });
  }

  function addSource(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const split = (v: FormDataEntryValue | null) =>
      String(v ?? "")
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
    const source = {
      name: String(fd.get("name") ?? ""),
      type: String(fd.get("type") ?? "rss") as AdSource["type"],
      url: String(fd.get("url") ?? ""),
      keywords: split(fd.get("keywords")),
      excludeKeywords: split(fd.get("excludeKeywords")),
      region: String(fd.get("region") ?? "Halifax Regional Municipality"),
      enabled: true,
    };
    const form = e.currentTarget;
    return act("source", async () => {
      if (staticMode) {
        await mutateAppData((d) => {
          d.adSources.push({ ...source, id: clientNewId(), lastPolledAt: null, lastError: null, createdAt: clientNowIso() });
        });
      } else {
        await post({ action: "add_source", source });
      }
      form.reset();
      setShowSourceForm(false);
      return `Source "${source.name}" added.`;
    });
  }

  function toggleSource(s: AdSource) {
    return act(`src:${s.id}`, async () => {
      if (staticMode) {
        await mutateAppData((d) => {
          const x = d.adSources.find((y) => y.id === s.id);
          if (x) x.enabled = !x.enabled;
        });
        return;
      }
      await post({ action: "update_source", id: s.id, source: { ...s, enabled: !s.enabled } });
    });
  }

  function removeSource(s: AdSource) {
    if (!window.confirm(`Remove source "${s.name}"? Existing ads stay.`)) return;
    return act(`src:${s.id}`, async () => {
      if (staticMode) {
        await mutateAppData((d) => {
          d.adSources = d.adSources.filter((y) => y.id !== s.id);
        });
        return;
      }
      await post({ action: "remove_source", id: s.id });
    });
  }

  function adAction(id: string, action: string, extra: Record<string, unknown> = {}) {
    return act(`${action}:${id}`, async () => {
      if (staticMode) {
        await mutateAppDataAsync(async (d) => {
          const ad = d.adListings.find((a) => a.id === id);
          if (!ad) return;
          if (action === "skip") ad.status = "skipped";
          else if (action === "restore") ad.status = "new";
          else if (action === "mark_replied") {
            ad.status = "replied";
            ad.repliedAt = clientNowIso();
          } else if (action === "requalify") {
            ad.status = "new";
            await qualifyListing(d, ad, { newId: clientNewId, nowIso: clientNowIso, ai: false }, { force: Boolean(extra.force) });
          } else if (action === "set_status" && typeof extra.status === "string") ad.status = extra.status as AdListing["status"];
        });
        return;
      }
      await post({ action, id, ...extra });
    });
  }

  function outreachAction(item: OutreachQueueItem, action: "approve" | "send" | "cancel") {
    return act(`${action}:${item.id}`, async () => {
      if (staticMode) {
        await mutateAppData((d) => {
          const o = d.outreachQueue.find((x) => x.id === item.id);
          if (!o) return;
          if (action === "approve") o.status = "approved";
          else if (action === "cancel") o.status = "cancelled";
          else {
            o.status = "sent";
            o.sentAt = clientNowIso();
            o.provider = "manual";
            const ad = d.adListings.find((a) => a.id === o.adId);
            if (ad) ad.status = "sent";
          }
        });
        return action === "send" ? "Marked sent (demo)." : undefined;
      }
      const r = await post<{ ok: boolean; item: OutreachQueueItem }>({ action, id: item.id });
      if (action === "send") {
        return r.item.status === "sent"
          ? `Sent via ${r.item.provider ?? item.channel}.`
          : `Not sent: ${r.item.error ?? "no sender configured for this channel — approve it and it will go out when SMTP/Twilio is set up"}`;
      }
    });
  }

  function saveEdit(item: OutreachQueueItem) {
    const draft = editing[item.id];
    if (!draft) return;
    return act(`edit:${item.id}`, async () => {
      if (staticMode) {
        await mutateAppData((d) => {
          const o = d.outreachQueue.find((x) => x.id === item.id);
          if (o) {
            o.subject = draft.subject;
            o.message = draft.message;
          }
        });
      } else {
        await post({ action: "update_outreach", id: item.id, outreach: draft });
      }
      setEditing((e) => {
        const next = { ...e };
        delete next[item.id];
        return next;
      });
      return "Draft saved.";
    });
  }

  function sendTest(channel: "email" | "sms") {
    if (!testTo) return;
    return act(`test:${channel}`, async () => {
      const r = await post<{ ok: boolean; error: string | null; provider: string }>({ action: "send_test", channel, to: testTo });
      return r.ok ? `Test ${channel} sent via ${r.provider}.` : `Test failed: ${r.error}`;
    });
  }

  const listings = useMemo(() => {
    if (!payload) return [];
    const all = payload.listings;
    switch (filter) {
      case "attention":
        return all.filter((a) => a.status === "drafted" || a.status === "qualified" || a.status === "new");
      case "new":
        return all.filter((a) => a.status === "new");
      case "drafted":
        return all.filter((a) => a.status === "drafted" || a.status === "qualified");
      case "sent":
        return all.filter((a) => a.status === "sent");
      case "replied":
        return all.filter((a) => a.status === "replied" || a.status === "won" || a.status === "lost");
      case "skipped":
        return all.filter((a) => a.status === "skipped");
      default:
        return all;
    }
  }, [payload, filter]);

  const selectedAd = payload?.listings.find((a) => a.id === selected) ?? listings[0] ?? null;
  const selectedOutreach = selectedAd ? (payload?.outreach ?? []).filter((o) => o.adId === selectedAd.id) : [];

  if (!payload) {
    return (
      <PageFrame context="Sales & clients" title="Job ads & outreach" subtitle="Loading…">
        <p className="cc-empty">{error ?? "Loading…"}</p>
      </PageFrame>
    );
  }

  const { setup, stats, sources } = payload;
  const metrics = [
    { label: "Awaiting your approval", value: stats.pendingApproval, hint: "drafted replies", signal: stats.pendingApproval > 0 },
    { label: "New ads", value: stats.new, hint: "not yet triaged", signal: stats.new > 0 },
    { label: "Replies sent", value: stats.sent, hint: "waiting on poster" },
    { label: "Conversations", value: stats.replied, hint: "poster answered" },
    { label: "Sources", value: sources.filter((s) => s.enabled).length, hint: `${sources.length} configured` },
  ];

  return (
    <PageFrame
      context="Sales & clients"
      title="Job ads & outreach"
      subtitle="Local 'need a contractor' ads flow in, Mainframe triages them, drafts a reply, and you approve (or let it auto-send). Every reply becomes a lead."
      actions={
        <>
          <button type="button" className="btn-secondary !py-1.5 !text-xs" disabled={busy !== null} onClick={() => setShowManual((v) => !v)}>
            Paste an ad
          </button>
          <button type="button" className="btn-primary !py-1.5 !text-xs" disabled={busy !== null} onClick={ingestNow}>
            {busy === "ingest" ? "Checking…" : "Check sources now"}
          </button>
        </>
      }
    >
      {message ? <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{message}</p> : null}
      {error ? <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p> : null}

      <MetricStrip items={metrics} />

      {setup ? <SetupStrip setup={setup} testTo={testTo} setTestTo={setTestTo} sendTest={sendTest} busy={busy} /> : null}

      {showManual ? (
        <Panel title="Paste an ad">
          <form onSubmit={addManual} className="grid gap-3 md:grid-cols-2">
            <label className="field md:col-span-2">
              <span>Title *</span>
              <input name="title" required className="field-input" placeholder="Need siding replaced on bungalow in Dartmouth" />
            </label>
            <label className="field md:col-span-2">
              <span>Ad text</span>
              <textarea name="body" rows={4} className="field-input" placeholder="Paste the full ad here…" />
            </label>
            <label className="field">
              <span>Ad URL</span>
              <input name="url" className="field-input" placeholder="https://www.kijiji.ca/v-…" />
            </label>
            <label className="field">
              <span>Location</span>
              <input name="location" className="field-input" placeholder="Dartmouth" />
            </label>
            <label className="field">
              <span>Poster name</span>
              <input name="contactName" className="field-input" />
            </label>
            <label className="field">
              <span>Poster email</span>
              <input name="contactEmail" type="email" className="field-input" />
            </label>
            <label className="field">
              <span>Poster phone</span>
              <input name="contactPhone" className="field-input" placeholder="902-555-0123" />
            </label>
            <div className="flex items-end gap-2">
              <button type="submit" className="btn-primary !py-2 !text-sm" disabled={busy !== null}>
                Add & triage
              </button>
              <button type="button" className="linkish text-sm" onClick={() => setShowManual(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Panel
          title="Inbox"
          action={
            <nav className="flex flex-wrap gap-1 text-xs">
              {(["attention", "all", "new", "drafted", "sent", "replied", "skipped"] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={cn("rounded-full px-2.5 py-1", filter === f ? "bg-white/15 text-white" : "text-[var(--muted)] hover:bg-white/5")}
                  onClick={() => setFilter(f)}
                >
                  {f === "attention" ? "Needs attention" : labelize(f)}
                </button>
              ))}
            </nav>
          }
        >
          {listings.length ? (
            <ul className="max-h-[36rem] space-y-1 overflow-y-auto">
              {listings.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={cn("w-full rounded-md px-3 py-2 text-left hover:bg-white/5", selectedAd?.id === a.id && "bg-white/10")}
                    onClick={() => setSelected(a.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight">{a.title}</p>
                      <span className={cn("shrink-0 font-mono text-xs", scoreTone(a.score))}>{a.status === "new" ? "…" : a.score}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {a.sourceName} · {a.location || "location unknown"} · {fmt(a.postedAt ?? a.fetchedAt)} · {labelize(a.category)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <StatusBadge status={a.status} />
                      {a.contactEmail ? <StatusBadge status="email" /> : null}
                      {a.contactPhone ? <StatusBadge status="sms" /> : null}
                      {!a.contactEmail && !a.contactPhone && a.status !== "new" ? <StatusBadge status="platform" /> : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cc-empty">
              {filter === "attention"
                ? "Nothing needs attention. Add a source or paste an ad to get started."
                : "No ads in this view."}
            </p>
          )}
        </Panel>

        <div className="grid gap-4">
          {selectedAd ? (
            <Panel
              title={selectedAd.title}
              action={
                <div className="flex flex-wrap gap-2 text-xs">
                  {selectedAd.url ? (
                    <a href={selectedAd.url} target="_blank" rel="noreferrer" className="linkish">
                      Open ad ↗
                    </a>
                  ) : null}
                  {selectedAd.leadId ? (
                    <Link href="/admin/sales?tab=pipeline" className="linkish">
                      Lead
                    </Link>
                  ) : null}
                </div>
              }
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <StatusBadge status={selectedAd.status} />
                <span className={cn("font-mono", scoreTone(selectedAd.score))}>score {selectedAd.score}</span>
                <span>· {labelize(selectedAd.category)}</span>
                {selectedAd.jobType ? <span>· {selectedAd.jobType}</span> : null}
                {selectedAd.classifiedBy ? <span>· triaged by {selectedAd.classifiedBy === "ai" ? "Mainframe AI" : "rules"}</span> : null}
              </div>
              {selectedAd.summary ? <p className="mt-2 text-sm">{selectedAd.summary}</p> : null}
              {selectedAd.reasons.length ? (
                <ul className="mt-1 flex flex-wrap gap-1">
                  {selectedAd.reasons.map((r, i) => (
                    <li key={i} className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-[var(--muted)]">
                      {r}
                    </li>
                  ))}
                </ul>
              ) : null}
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-[var(--muted)]">Contact</dt>
                <dd>
                  {[selectedAd.contactName, selectedAd.contactEmail, selectedAd.contactPhone].filter(Boolean).join(" · ") || "none in ad — reply on the platform"}
                </dd>
                <dt className="text-[var(--muted)]">Posted</dt>
                <dd>{fmt(selectedAd.postedAt ?? selectedAd.fetchedAt)}</dd>
              </dl>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-xs text-[var(--muted)]">Ad text</summary>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-[var(--muted)]">{selectedAd.body || "(no body)"}</p>
              </details>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {selectedAd.status === "new" || selectedAd.status === "skipped" ? (
                  <button type="button" className="btn-primary !py-1 !text-xs" disabled={busy !== null} onClick={() => adAction(selectedAd.id, "requalify", { force: selectedAd.status === "skipped" })}>
                    {selectedAd.status === "skipped" ? "Draft reply anyway" : "Triage & draft"}
                  </button>
                ) : null}
                {selectedAd.status === "drafted" || selectedAd.status === "qualified" ? (
                  <button type="button" className="btn-secondary !py-1 !text-xs" disabled={busy !== null} onClick={() => adAction(selectedAd.id, "redraft")}>
                    Redraft
                  </button>
                ) : null}
                {selectedAd.status === "sent" ? (
                  <button type="button" className="btn-secondary !py-1 !text-xs" disabled={busy !== null} onClick={() => adAction(selectedAd.id, "mark_replied")}>
                    They replied
                  </button>
                ) : null}
                {selectedAd.status === "replied" ? (
                  <>
                    <button type="button" className="btn-primary !py-1 !text-xs" disabled={busy !== null} onClick={() => adAction(selectedAd.id, "set_status", { status: "won" })}>
                      Won
                    </button>
                    <button type="button" className="linkish" disabled={busy !== null} onClick={() => adAction(selectedAd.id, "set_status", { status: "lost" })}>
                      Lost
                    </button>
                  </>
                ) : null}
                {selectedAd.status !== "skipped" && selectedAd.status !== "won" ? (
                  <button type="button" className="linkish" disabled={busy !== null} onClick={() => adAction(selectedAd.id, "skip")}>
                    Skip
                  </button>
                ) : null}
              </div>
            </Panel>
          ) : null}

          {selectedAd ? (
            <Panel title={`Replies (${selectedOutreach.length})`}>
              {selectedOutreach.length ? (
                <ul className="space-y-3">
                  {selectedOutreach.map((o) => {
                    const edit = editing[o.id];
                    const editable = o.status === "pending_approval" || o.status === "approved" || o.status === "failed";
                    return (
                      <li key={o.id} className="rounded-md border border-white/10 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex flex-wrap items-center gap-1">
                            <StatusBadge status={o.channel} />
                            <StatusBadge status={o.status} />
                            {o.followUpOf ? <span className="text-[var(--muted)]">follow-up</span> : null}
                            <span className="text-[var(--muted)]">→ {o.channel === "sms" ? o.prospectPhone : o.channel === "email" ? o.prospectEmail : "paste on platform"}</span>
                          </div>
                          <span className="text-[var(--muted)]">{o.sentAt ? `sent ${fmt(o.sentAt)}${o.provider ? ` · ${o.provider}` : ""}` : fmt(o.createdAt)}</span>
                        </div>
                        {o.error ? <p className="mt-1 text-xs text-rose-300">{o.error}</p> : null}
                        {edit ? (
                          <div className="mt-2 grid gap-2">
                            {o.channel !== "sms" ? (
                              <input className="field-input" value={edit.subject} onChange={(e) => setEditing((s) => ({ ...s, [o.id]: { ...edit, subject: e.target.value } }))} />
                            ) : null}
                            <textarea className="field-input" rows={o.channel === "sms" ? 3 : 8} value={edit.message} onChange={(e) => setEditing((s) => ({ ...s, [o.id]: { ...edit, message: e.target.value } }))} />
                            <div className="flex gap-2 text-xs">
                              <button type="button" className="btn-primary !py-1 !text-xs" disabled={busy !== null} onClick={() => saveEdit(o)}>
                                Save
                              </button>
                              <button type="button" className="linkish" onClick={() => setEditing((s) => { const n = { ...s }; delete n[o.id]; return n; })}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {o.channel !== "sms" ? <p className="mt-2 text-sm font-medium">{o.subject}</p> : null}
                            <p className="mt-1 whitespace-pre-wrap text-[13px] text-[var(--muted)]">{o.message}</p>
                            {o.channel === "sms" ? <p className="mt-1 text-[11px] text-[var(--muted)]">{o.message.length} chars{o.message.length > 160 ? " · 2 segments" : ""}</p> : null}
                          </>
                        )}
                        {editable && !edit ? (
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            {o.channel === "email" || o.channel === "sms" ? (
                              <button type="button" className="btn-primary !py-1 !text-xs" disabled={busy !== null} onClick={() => outreachAction(o, "send")}>
                                {busy === `send:${o.id}` ? "Sending…" : "Send now"}
                              </button>
                            ) : (
                              <button type="button" className="btn-primary !py-1 !text-xs" disabled={busy !== null} onClick={() => outreachAction(o, "send")}>
                                I pasted it on the platform
                              </button>
                            )}
                            {o.status === "pending_approval" && (o.channel === "email" || o.channel === "sms") ? (
                              <button type="button" className="btn-secondary !py-1 !text-xs" disabled={busy !== null} onClick={() => outreachAction(o, "approve")}>
                                Approve (send on next tick)
                              </button>
                            ) : null}
                            <button type="button" className="linkish" onClick={() => setEditing((s) => ({ ...s, [o.id]: { subject: o.subject, message: o.message } }))}>
                              Edit
                            </button>
                            {o.channel !== "platform" ? (
                              <button type="button" className="linkish" onClick={() => navigator.clipboard?.writeText(o.message)}>
                                Copy
                              </button>
                            ) : (
                              <button type="button" className="linkish" onClick={() => navigator.clipboard?.writeText(o.message.split("\n\n--- SMS")[0])}>
                                Copy email version
                              </button>
                            )}
                            <button type="button" className="linkish" disabled={busy !== null} onClick={() => outreachAction(o, "cancel")}>
                              Cancel
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="cc-empty">
                  {selectedAd.status === "new" ? "Not triaged yet — click Triage & draft." : selectedAd.status === "skipped" ? "Skipped as not a job request. Use 'Draft reply anyway' to override." : "No drafts."}
                </p>
              )}
            </Panel>
          ) : null}
        </div>
      </div>

      <Panel
        title={`Sources (${sources.length})`}
        action={
          <button type="button" className="linkish text-xs" onClick={() => setShowSourceForm((v) => !v)}>
            {showSourceForm ? "Close" : "Add source"}
          </button>
        }
      >
        {showSourceForm ? (
          <form onSubmit={addSource} className="mb-4 grid gap-3 md:grid-cols-2">
            <label className="field">
              <span>Name *</span>
              <input name="name" required className="field-input" placeholder="Kijiji alerts — Halifax services wanted" />
            </label>
            <label className="field">
              <span>Type</span>
              <select name="type" className="field-input" defaultValue="rss">
                <option value="rss">RSS / Atom feed URL</option>
                <option value="imap">Alert mailbox (IMAP — configured in .env)</option>
                <option value="webhook">Inbound webhook (Zapier / Cloudflare)</option>
                <option value="manual">Manual paste</option>
              </select>
            </label>
            <label className="field md:col-span-2">
              <span>Feed URL (RSS only)</span>
              <input name="url" className="field-input" placeholder="https://…/rss" />
            </label>
            <label className="field">
              <span>Keep only ads containing (comma-separated, empty = all)</span>
              <input name="keywords" className="field-input" placeholder="siding, deck, soffit, fascia, windows, contractor, quote" />
            </label>
            <label className="field">
              <span>Drop ads containing</span>
              <input name="excludeKeywords" className="field-input" placeholder="for sale, we offer, free estimates, hiring" />
            </label>
            <label className="field">
              <span>Region label</span>
              <input name="region" className="field-input" defaultValue="Halifax Regional Municipality" />
            </label>
            <div className="flex items-end">
              <button type="submit" className="btn-primary !py-2 !text-sm" disabled={busy !== null}>
                Save source
              </button>
            </div>
          </form>
        ) : null}
        {sources.length ? (
          <ul className="space-y-2 text-sm">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 px-3 py-2">
                <div>
                  <p className="font-medium">
                    {s.name} <span className="text-xs text-[var(--muted)]">· {s.type.toUpperCase()}</span>
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {s.url ? `${s.url} · ` : ""}
                    {s.keywords.length ? `keep: ${s.keywords.join(", ")} · ` : ""}
                    {s.excludeKeywords.length ? `drop: ${s.excludeKeywords.join(", ")} · ` : ""}
                    last poll {fmt(s.lastPolledAt)}
                    {s.lastError ? <span className="text-rose-300"> · {s.lastError}</span> : null}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <StatusBadge status={s.enabled ? "enabled" : "disabled"} />
                  <button type="button" className="linkish" disabled={busy !== null} onClick={() => toggleSource(s)}>
                    {s.enabled ? "Pause" : "Enable"}
                  </button>
                  <button type="button" className="linkish" disabled={busy !== null} onClick={() => removeSource(s)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cc-empty">
            No sources yet. The fastest setup: create Kijiji saved-search alerts that email a mailbox, put that mailbox in <code>ADS_IMAP_*</code>, then add an IMAP source here. See <code>docs/OUTREACH.md</code>.
          </p>
        )}
      </Panel>
    </PageFrame>
  );
}

function SetupStrip({
  setup,
  testTo,
  setTestTo,
  sendTest,
  busy,
}: {
  setup: Setup;
  testTo: string;
  setTestTo: (v: string) => void;
  sendTest: (c: "email" | "sms") => Promise<void> | void;
  busy: string | null;
}) {
  const chip = (ok: boolean, label: string, detail: string) => (
    <span className={cn("rounded-full px-2.5 py-1 text-xs", ok ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-100")} title={detail}>
      {ok ? "●" : "○"} {label}
    </span>
  );
  const needs: string[] = [];
  if (!setup.ai.configured) needs.push("ANTHROPIC_API_KEY (Claude) — AI triage and drafting; rules-only until set");
  if (!setup.email.configured) needs.push("SMTP_* (GoDaddy mailbox) or RESEND_API_KEY — send email replies");
  if (!setup.sms.configured) needs.push("TWILIO_* — send text replies");
  if (!setup.imap.configured && !setup.inboundWebhook) needs.push("ADS_IMAP_* (alert mailbox) or ADS_INBOUND_SECRET (webhook) — automatic ad intake");
  return (
    <Panel title="Connections">
      <div className="flex flex-wrap items-center gap-2">
        {chip(setup.ai.configured, `AI · ${setup.ai.configured ? `${setup.ai.provider} (${setup.ai.model})` : "rules only"}`, "Mainframe triage + reply drafting")}
        {chip(setup.email.configured, `Email · ${setup.email.configured ? setup.email.provider : "not connected"}`, setup.email.from ?? "")}
        {chip(setup.sms.configured, `SMS · ${setup.sms.configured ? "Twilio" : "not connected"}`, setup.sms.from ?? "")}
        {chip(setup.imap.configured, `Alert mailbox · ${setup.imap.configured ? `${setup.imap.user} / ${setup.imap.folder}` : "not connected"}`, setup.imap.host ?? "")}
        {chip(setup.inboundWebhook, "Inbound webhook", "/api/ads/inbound")}
        <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-[var(--muted)]">
          auto-send: {setup.autosend.length ? `${setup.autosend.join(" + ")} (score ≥ ${setup.autosendMinScore})` : "off — you approve every reply"} · cap {setup.dailyCap}/day · SMS quiet {setup.quietHours}h · follow-up after {setup.followUpDays}d
        </span>
      </div>
      {needs.length ? (
        <ul className="mt-2 list-disc pl-5 text-xs text-[var(--muted)]">
          {needs.map((n) => (
            <li key={n}>{n}</li>
          ))}
          <li>
            Full shopping list and setup steps: <code>docs/OUTREACH.md</code>
          </li>
        </ul>
      ) : null}
      {setup.email.configured || setup.sms.configured ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <input className="field-input !mt-0 !w-64 !py-1" placeholder="your email or phone for a test" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          {setup.email.configured ? (
            <button type="button" className="btn-secondary !py-1 !text-xs" disabled={busy !== null || !testTo} onClick={() => sendTest("email")}>
              Send test email
            </button>
          ) : null}
          {setup.sms.configured ? (
            <button type="button" className="btn-secondary !py-1 !text-xs" disabled={busy !== null || !testTo} onClick={() => sendTest("sms")}>
              Send test SMS
            </button>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
