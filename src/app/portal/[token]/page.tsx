"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import "../../q/[token]/quote.css";

type Payload = {
  job: { number?: string; title: string; status: string; address: string; startDate: string; customerName: string; completedAt: string | null };
  crewLead: { name: string; phone: string } | null;
  company: { name: string; phone: string; email: string; website: string; signer: string };
  quotes: Array<{ number: string; status: string; total: number; url: string; signedAt: string | null }>;
  invoices: Array<{ number?: string; status: string; total: number; balance: number; dueAt: string | null; url: string | null }>;
  progress: Array<{ id: string; createdAt: string; notes: string; summary: string | null; photos: string[] }>;
  documents: Array<{ id: string; kind: string; title: string; number: string; sentAt: string | null; url: string }>;
  schedule: Array<{ title: string; startAt: string; endAt: string; status: string }>;
  messages: Array<{ direction: "in" | "out"; channel: string; body: string; createdAt: string }>;
  canPayOnline: boolean;
};

const money = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "—");
const STATUS: Record<string, string> = { scheduled: "Scheduled", in_progress: "In progress", on_hold: "On hold", completed: "Completed", invoiced: "Completed & invoiced" };

export default function CustomerPortalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);

  const load = () =>
    fetch(`/api/public/portal/${token}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error("This link is not valid"))))
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    const poll = window.setInterval(() => void load(), 30_000);
    return () => {
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!msg.trim()) return;
    await fetch(`/api/public/portal/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: msg.trim() }) });
    setMsg("");
    setSent(true);
    await load();
  }

  if (error && !data) return <main className="pq"><div className="pq-card"><h1>Link not valid</h1><p>{error}</p></div></main>;
  if (!data) return <main className="pq"><div className="pq-card"><p>Loading your job…</p></div></main>;
  const { job, company: c } = data;
  const owing = data.invoices.reduce((s, i) => s + i.balance, 0);

  return (
    <main className="pq">
      <div className="pq-card">
        <header className="pq-head">
          <div><p className="pq-brand">{c.name}</p><p className="pq-meta">{c.phone} · {c.email}</p></div>
          <div className="pq-right"><p className="pq-title">Your job</p><p className="pq-meta">{job.number ?? ""}</p></div>
        </header>
        <h1 className="pq-h1">{job.title}</h1>
        <p className="pq-meta">{job.address} · <span className={`pq-badge ${job.status === "completed" || job.status === "invoiced" ? "pq-badge-ok" : ""}`}>{STATUS[job.status] ?? job.status}</span> · start {day(job.startDate)}{job.completedAt ? ` · completed ${day(job.completedAt)}` : ""}</p>
        {data.crewLead ? <p className="pq-meta">Your crew lead: {data.crewLead.name}{data.crewLead.phone ? ` · ${data.crewLead.phone}` : ""}</p> : null}

        {owing > 0 ? <section className="pq-done" style={{ background: "#fff8ed", borderColor: "#fed7aa" }}><h2>{money(owing)} outstanding</h2><p>{data.invoices.filter((i) => i.balance > 0).map((i) => <span key={i.number}>{i.number ?? "Invoice"} · {money(i.balance)}{i.dueAt ? ` · due ${day(i.dueAt)}` : ""} {i.url ? <a className="pq-link" href={i.url}>View & pay</a> : null}<br /></span>)}</p></section> : null}

        {data.schedule.length ? <div className="pq-block"><h3>Upcoming crew days</h3><ul className="pq-list">{data.schedule.map((s, i) => <li key={i}><span>{day(s.startAt)} · {new Date(s.startAt).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}–{new Date(s.endAt).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}</span><span className="pq-meta">{s.title}</span></li>)}</ul></div> : null}

        <div className="pq-block">
          <h3>Progress</h3>
          {data.progress.length ? data.progress.map((p) => (
            <div key={p.id} style={{ marginBottom: "1rem" }}>
              <p className="pq-meta">{day(p.createdAt)}</p>
              <p className="pq-pre">{p.summary ?? p.notes}</p>
              {p.photos.length ? <div className="pq-photos">{p.photos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={i} href={src} target="_blank" rel="noreferrer"><img src={src} alt="Site photo" /></a>
              ))}</div> : null}
            </div>
          )) : <p className="pq-meta">Updates and photos from the crew will appear here as work progresses.</p>}
        </div>

        {data.quotes.length || data.documents.length || data.invoices.length ? (
          <div className="pq-block">
            <h3>Documents</h3>
            <ul className="pq-list">
              {data.quotes.map((q) => <li key={q.number}><span>Quote {q.number} · {money(q.total)}</span><span><span className={`pq-badge ${q.status === "signed" ? "pq-badge-ok" : "pq-badge-warn"}`}>{q.status}</span> <a className="pq-link" href={q.url}>{q.status === "signed" ? "View" : "Review & sign"}</a></span></li>)}
              {data.invoices.map((i) => <li key={i.number ?? i.url ?? Math.random()}><span>{i.status === "paid" ? "Receipt" : "Invoice"} {i.number ?? ""} · {money(i.total)}</span><span><span className={`pq-badge ${i.status === "paid" ? "pq-badge-ok" : "pq-badge-warn"}`}>{i.status}</span> {i.url ? <a className="pq-link" href={i.url}>{i.status === "paid" ? "View" : "Pay"}</a> : null}</span></li>)}
              {data.documents.filter((d) => d.kind === "contract" || d.kind === "job_report").map((d) => <li key={d.id}><span>{d.title}</span><a className="pq-link" href={d.url} target="_blank" rel="noreferrer">PDF</a></li>)}
            </ul>
          </div>
        ) : null}

        <div className="pq-block">
          <h3>Messages</h3>
          {data.messages.map((m, i) => <div key={i} className={`pq-msg ${m.direction === "out" ? "pq-msg-out" : "pq-msg-in"}`}><p className="pq-meta">{m.direction === "out" ? c.name : "You"} · {day(m.createdAt)}</p>{m.body}</div>)}
          <form onSubmit={send} className="pq-decline" style={{ marginTop: "0.75rem" }}>
            <textarea placeholder={`Question for ${c.signer}? Type it here — we'll reply by text or email.`} value={msg} onChange={(e) => setMsg(e.target.value)} />
            <div className="pq-actions"><button type="submit" className="pq-btn" disabled={!msg.trim()}>Send message</button>{sent ? <span className="pq-meta">Sent — we&apos;ll get back to you shortly.</span> : null}</div>
          </form>
        </div>
        <footer className="pq-foot">{c.name} · {c.website} · {c.phone}</footer>
      </div>
    </main>
  );
}
