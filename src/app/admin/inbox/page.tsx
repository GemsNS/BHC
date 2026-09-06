"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Panel } from "@/components/cc";
import { RequireAuth } from "@/components/RequireAuth";
import { fetchJson } from "@/lib/client-data";
import type { Thread } from "@/lib/messaging";
import type { Lead, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

type ListPayload = { threads: Thread[]; unread: number; voicemails: Message[]; connections: { sms: boolean; email: boolean } };
type ThreadPayload = { thread: string; messages: Message[]; lead: Lead | null };

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function InboxPage() {
  return (
    <RequireAuth perm="crm">
      <Inbox />
    </RequireAuth>
  );
}

function Inbox() {
  const [list, setList] = useState<ListPayload | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadPayload | null>(null);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [compose, setCompose] = useState<{ channel: "sms" | "email"; to: string } | null>(null);

  const load = useCallback(async () => {
    setList(await fetchJson<ListPayload>("/api/messages"));
  }, []);
  const open = useCallback(async (key: string) => {
    setActive(key);
    const t = await fetchJson<ThreadPayload>(`/api/messages?thread=${encodeURIComponent(key)}`);
    setThread(t);
    setDraft("");
    await fetchJson("/api/messages", { method: "POST", body: JSON.stringify({ action: "read", thread: key }) });
    void load();
  }, [load]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => {
      void load();
      if (active) void fetchJson<ThreadPayload>(`/api/messages?thread=${encodeURIComponent(active)}`).then(setThread);
    }, 20_000);
    return () => window.clearInterval(t);
  }, [load, active]);

  const activeThread = list?.threads.find((t) => t.key === active) ?? null;
  const channel = compose?.channel ?? activeThread?.channel ?? "sms";
  const to = compose?.to ?? activeThread?.address ?? "";

  async function send() {
    if (!draft.trim() || !to) return;
    setBusy("send");
    setMsg(null);
    try {
      const r = await fetchJson<{ ok: boolean; error?: string }>("/api/messages", { method: "POST", body: JSON.stringify({ action: "send", channel, to, body: draft.trim(), subject: subject || undefined, leadId: thread?.lead?.id ?? activeThread?.leadId ?? null, jobId: activeThread?.jobId ?? null }) });
      setMsg(r.ok ? "Sent." : `Failed: ${r.error}`);
      setDraft("");
      setCompose(null);
      const key = `${channel}:${to.toLowerCase()}`;
      await load();
      await open(active ?? key);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(null);
    }
  }

  async function aiDraft() {
    if (!active) return;
    setBusy("draft");
    try {
      const r = await fetchJson<{ text: string; by: string }>("/api/messages", { method: "POST", body: JSON.stringify({ action: "draft", thread: active, instruction: instruction || undefined }) });
      setDraft(r.text);
      setMsg(r.by === "ai" ? "Drafted by Claude — edit before sending." : "Template draft (no AI key) — edit before sending.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageFrame
      context="Sales & clients"
      title="Inbox"
      subtitle="Every text, email reply, voicemail and portal message in one place. Reply here; Claude can draft it for you."
      actions={
        <>
          <button type="button" className="btn-secondary !py-1.5 !text-xs" onClick={() => { setCompose({ channel: "sms", to: "" }); setActive(null); setThread(null); }}>New text</button>
          <button type="button" className="btn-secondary !py-1.5 !text-xs" onClick={() => { setCompose({ channel: "email", to: "" }); setActive(null); setThread(null); }}>New email</button>
        </>
      }
    >
      {list && (!list.connections.sms || !list.connections.email) ? (
        <p className="cc-empty">{!list.connections.sms ? "SMS not connected (TWILIO_*). " : ""}{!list.connections.email ? "Email not connected (SMTP_* / RESEND_API_KEY). " : ""}Inbound still works; outbound needs the keys.</p>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="grid gap-4">
          <Panel title={`Conversations${list?.unread ? ` · ${list.unread} unread` : ""}`}>
            {list?.threads.length ? (
              <ul className="max-h-[32rem] space-y-1 overflow-y-auto">
                {list.threads.map((t) => (
                  <li key={t.key}>
                    <button type="button" className={cn("w-full rounded-md px-3 py-2 text-left hover:bg-white/5", active === t.key && "bg-white/10")} onClick={() => open(t.key)}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("truncate font-medium", t.unread > 0 && "text-white")}>{t.name}</span>
                        <span className="shrink-0 text-[11px] text-[var(--muted)]">{fmt(t.lastAt)}</span>
                      </div>
                      <p className="truncate text-xs text-[var(--muted)]">
                        <span className="uppercase">{t.channel}</span> · {t.lastBody}
                      </p>
                      {t.unread ? <span className="mt-1 inline-block rounded-full bg-sky-500/30 px-2 text-[10px] text-sky-100">{t.unread} new</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cc-empty">No conversations yet. Inbound texts, replies to outreach, and voicemails appear here.</p>
            )}
          </Panel>
          {list?.voicemails.length ? (
            <Panel title="Voicemails">
              <ul className="space-y-2 text-sm">
                {list.voicemails.map((v) => (
                  <li key={v.id} className="rounded-md border border-white/10 px-3 py-2">
                    <p className="text-xs text-[var(--muted)]">{fmt(v.createdAt)} · {v.from}{v.durationSec ? ` · ${v.durationSec}s` : ""}</p>
                    <p>{v.body}</p>
                    <div className="mt-1 flex gap-2 text-xs">
                      {v.recordingUrl ? <a href={v.recordingUrl} target="_blank" rel="noreferrer" className="linkish">Listen</a> : null}
                      <button type="button" className="linkish" onClick={async () => { await fetchJson("/api/messages", { method: "POST", body: JSON.stringify({ action: "read_voicemail", id: v.id }) }); void load(); }}>Done</button>
                      {v.leadId ? <button type="button" className="linkish" onClick={() => open(`sms:${v.from}`)}>Text back</button> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        <Panel
          title={compose ? `New ${compose.channel}` : activeThread ? `${activeThread.name} · ${activeThread.channel.toUpperCase()}` : "Select a conversation"}
          action={
            thread?.lead ? (
              <span className="flex gap-2 text-xs">
                <Link href="/admin/sales?tab=pipeline" className="linkish">{thread.lead.status} lead</Link>
                {activeThread?.jobId ? <Link href={`/admin/jobs/${activeThread.jobId}`} className="linkish">Job hub</Link> : null}
              </span>
            ) : null
          }
        >
          {compose ? (
            <div className="mb-3 grid gap-2 sm:grid-cols-[120px_1fr]">
              <select className="field-input !mt-0 !py-1 !text-xs" value={compose.channel} onChange={(e) => setCompose({ ...compose, channel: e.target.value as "sms" | "email" })}><option value="sms">SMS</option><option value="email">Email</option></select>
              <input className="field-input !mt-0 !py-1 !text-xs" placeholder={compose.channel === "sms" ? "+1 902 555 0123" : "customer@example.com"} value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} />
            </div>
          ) : null}
          {thread ? (
            <ul className="mb-3 max-h-[26rem] space-y-2 overflow-y-auto text-sm">
              {thread.messages.map((m) => (
                <li key={m.id} className={cn("max-w-[80%] rounded-md px-3 py-2", m.direction === "out" ? "ml-auto bg-sky-500/10" : "bg-white/5")}>
                  <p className="text-[11px] text-[var(--muted)]">{m.direction === "out" ? "BHC" : thread.lead?.name ?? m.from} · {m.channel}{m.provider ? ` · ${m.provider}` : ""} · {fmt(m.createdAt)}{m.status === "failed" ? <span className="text-rose-300"> · failed</span> : null}</p>
                  {m.subject ? <p className="font-medium">{m.subject}</p> : null}
                  <p className="whitespace-pre-wrap">{m.transcription ?? m.body}</p>
                  {m.recordingUrl ? <a href={m.recordingUrl} target="_blank" rel="noreferrer" className="linkish text-xs">Listen to recording</a> : null}
                </li>
              ))}
              {!thread.messages.length ? <li className="cc-empty">Empty thread.</li> : null}
            </ul>
          ) : !compose ? (
            <p className="cc-empty">Pick a conversation on the left or start a new one.</p>
          ) : null}
          {(thread || compose) ? (
            <div className="grid gap-2">
              {channel === "email" ? <input className="field-input !mt-0 !py-1 !text-xs" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} /> : null}
              <textarea className="field-input" rows={channel === "sms" ? 3 : 6} placeholder={channel === "sms" ? "Text message…" : "Email…"} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button type="button" className="btn-primary !py-1 !text-xs" disabled={busy !== null || !draft.trim() || !to} onClick={send}>{busy === "send" ? "Sending…" : `Send ${channel.toUpperCase()}`}</button>
                {active ? (
                  <>
                    <input className="field-input !mt-0 !w-64 !py-1 !text-xs" placeholder="Tell Claude how to reply (optional)" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
                    <button type="button" className="btn-secondary !py-1 !text-xs" disabled={busy !== null} onClick={aiDraft}>{busy === "draft" ? "Drafting…" : "Draft with AI"}</button>
                  </>
                ) : null}
                {channel === "sms" ? <span className="text-[var(--muted)]">{draft.length} chars</span> : null}
                {msg ? <span className="text-[var(--muted)]">{msg}</span> : null}
              </div>
            </div>
          ) : null}
        </Panel>
      </div>
    </PageFrame>
  );
}
