"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SignaturePad } from "@/components/knocker/SignaturePad";
import "./quote.css";

type Payload = {
  quote: { number: string; title: string; customerName: string; address: string; scope: string; lines: Array<{ id: string; description: string; quantity: number; unit: string; unitPrice: number }>; taxRate: number; discount: number; depositPercent: number; validUntil: string | null; status: string; notes: string; terms: string; signedAt: string | null; signerName: string | null; pdfUrl: string | null };
  totals: { subtotal: number; discount: number; tax: number; total: number; deposit: number; balance: number };
  company: { name: string; phone: string; email: string; website: string; address: string; signer: string };
};

const money = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ depositAmount: number; portalUrl: string | null; jobNumber: string | null } | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    fetch(`/api/public/quote/${token}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error ?? "Not found"))))
      .then((j: Payload) => {
        setData(j);
        setName(j.quote.customerName);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  async function sign() {
    if (!signature || name.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/public/quote/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sign", signerName: name.trim(), signerEmail: email.trim() || undefined, signatureDataUrl: signature }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not sign");
      setDone(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign");
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    try {
      await fetch(`/api/public/quote/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "decline", reason }) });
      setData((d) => (d ? { ...d, quote: { ...d.quote, status: "declined" } } : d));
      setDeclining(false);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <main className="pq"><div className="pq-card"><h1>Quote not found</h1><p>{error}</p></div></main>;
  if (!data) return <main className="pq"><div className="pq-card"><p>Loading your quote…</p></div></main>;
  const { quote: q, totals: t, company: c } = data;
  const expired = q.status === "expired" || (q.validUntil && new Date(q.validUntil).getTime() < Date.now() && q.status !== "signed");

  return (
    <main className="pq">
      <div className="pq-card">
        <header className="pq-head">
          <div>
            <p className="pq-brand">{c.name}</p>
            <p className="pq-meta">{c.address} · {c.phone} · {c.email}</p>
          </div>
          <div className="pq-right">
            <p className="pq-title">Quote</p>
            <p className="pq-meta">{q.number}{q.validUntil ? ` · valid until ${new Date(q.validUntil).toLocaleDateString("en-CA")}` : ""}</p>
            {q.pdfUrl || true ? <a href={`/api/public/quote/${token}/pdf`} className="pq-link" target="_blank" rel="noreferrer">Download PDF</a> : null}
          </div>
        </header>

        {done ? (
          <section className="pq-done">
            <h2>Thank you, {name.split(" ")[0]} — you&apos;re booked in.</h2>
            <p>We&apos;ve emailed you a signed copy. {done.depositAmount > 0 ? `A deposit invoice for ${money(done.depositAmount)} is on its way with an online pay link (Interac e-Transfer to ${c.email} works too).` : ""}</p>
            {done.portalUrl ? <p>Track the job, photos and invoices any time: <a className="pq-link" href={done.portalUrl}>{done.portalUrl}</a></p> : null}
            <p className="pq-meta">{c.signer} will be in touch to confirm the start date.</p>
          </section>
        ) : null}

        <section>
          <h1 className="pq-h1">{q.title}</h1>
          <p className="pq-meta">Prepared for {q.customerName}{q.address ? ` · ${q.address}` : ""}</p>
          {q.scope ? <div className="pq-block"><h3>Scope of work</h3><p className="pq-pre">{q.scope}</p></div> : null}
          <table className="pq-table">
            <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead>
            <tbody>
              {q.lines.map((l) => (
                <tr key={l.id}><td>{l.description}</td><td>{l.quantity} {l.unit}</td><td>{money(l.unitPrice)}</td><td>{money(l.quantity * l.unitPrice)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="pq-totals">
            <div><span>Subtotal</span><span>{money(t.subtotal)}</span></div>
            {t.discount ? <div><span>Discount</span><span>-{money(t.discount)}</span></div> : null}
            <div><span>HST ({Math.round(q.taxRate * 100)}%)</span><span>{money(t.tax)}</span></div>
            <div className="pq-total"><span>Total</span><span>{money(t.total)}</span></div>
            <div><span>Deposit on acceptance ({q.depositPercent}%)</span><span>{money(t.deposit)}</span></div>
            <div><span>Balance on completion</span><span>{money(t.balance)}</span></div>
          </div>
          {q.notes ? <div className="pq-block"><h3>Notes</h3><p className="pq-pre">{q.notes}</p></div> : null}
          <details className="pq-block"><summary>Terms</summary><p className="pq-pre pq-small">{q.terms}</p></details>
        </section>

        {q.status === "signed" && !done ? (
          <section className="pq-done"><h2>Signed by {q.signerName} on {q.signedAt ? new Date(q.signedAt).toLocaleDateString("en-CA") : ""}</h2><p>Thank you — we&apos;ll be in touch about scheduling.</p></section>
        ) : q.status === "declined" ? (
          <section className="pq-done"><h2>Quote declined</h2><p>No problem — if anything changes, reply to the email you received or call {c.phone}.</p></section>
        ) : expired ? (
          <section className="pq-done"><h2>This quote has expired</h2><p>Prices may have changed. Call {c.phone} or email {c.email} for a refreshed quote.</p></section>
        ) : !done ? (
          <section className="pq-sign">
            <h2>Accept and sign</h2>
            <p className="pq-meta">Sign below to accept this quote. You&apos;ll get a signed copy and the deposit invoice by email.</p>
            <div className="pq-fields">
              <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label>Email for your copy<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
            </div>
            <div className="pq-pad"><SignaturePad onChange={setSignature} /></div>
            {error ? <p className="pq-error">{error}</p> : null}
            <div className="pq-actions">
              <button type="button" className="pq-btn" disabled={busy || !signature || name.trim().length < 2} onClick={sign}>{busy ? "Signing…" : `Accept ${money(t.total)}`}</button>
              {!declining ? <button type="button" className="pq-btn-ghost" disabled={busy} onClick={() => setDeclining(true)}>Decline</button> : null}
            </div>
            {declining ? (
              <div className="pq-decline">
                <textarea placeholder="Optional — tell us why, so we can do better" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="pq-actions"><button type="button" className="pq-btn-ghost" disabled={busy} onClick={decline}>Confirm decline</button><button type="button" className="pq-btn-ghost" onClick={() => setDeclining(false)}>Cancel</button></div>
              </div>
            ) : null}
          </section>
        ) : null}
        <footer className="pq-foot">{c.name} · {c.website}</footer>
      </div>
    </main>
  );
}
