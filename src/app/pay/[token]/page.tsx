"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import "../../q/[token]/quote.css";

type Payload = {
  invoice: { number?: string; status: string; customerName: string; lines: Array<{ id: string; description: string; quantity: number; unitPrice: number }>; total: number; balance: number; dueAt: string | null; createdAt: string; notes: string; aiSummary: string | null };
  job: { title: string; address: string; number?: string } | null;
  company: { name: string; phone: string; email: string; website: string; address: string };
  payments: Array<{ amount: number; method: string; receivedAt: string }>;
  canPayOnline: boolean;
  etransferEmail: string | null;
};

const money = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function PayPageInner() {
  const { token } = useParams<{ token: string }>();
  const search = useSearchParams();
  const justPaid = search.get("paid") === "1";
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/public/pay/${token}`)
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error("Invoice not found"))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);

  async function payOnline() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/public/pay/${token}`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error ?? "Online payment unavailable");
      window.location.href = j.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start payment");
      setBusy(false);
    }
  }

  if (error && !data) return <main className="pq"><div className="pq-card"><h1>Invoice not found</h1><p>{error}</p></div></main>;
  if (!data) return <main className="pq"><div className="pq-card"><p>Loading…</p></div></main>;
  const { invoice: inv, job, company: c } = data;
  const paid = inv.status === "paid" || inv.balance <= 0;

  return (
    <main className="pq">
      <div className="pq-card">
        <header className="pq-head">
          <div><p className="pq-brand">{c.name}</p><p className="pq-meta">{c.address} · {c.phone} · {c.email}</p></div>
          <div className="pq-right"><p className="pq-title">{paid ? "Receipt" : "Invoice"}</p><p className="pq-meta">{inv.number ?? ""}{inv.dueAt && !paid ? ` · due ${new Date(inv.dueAt).toLocaleDateString("en-CA")}` : ""}</p><a className="pq-link" href={`/api/public/pay/${token}?pdf=1`} target="_blank" rel="noreferrer">Download PDF</a></div>
        </header>
        {justPaid || paid ? <section className="pq-done"><h2>{justPaid ? "Payment received — thank you!" : "Paid in full — thank you"}</h2><p>{justPaid ? "A receipt will follow by email once the payment settles." : "This invoice is settled."}</p></section> : null}
        <h1 className="pq-h1">{job?.title ?? "Invoice"}</h1>
        <p className="pq-meta">{inv.customerName}{job?.address ? ` · ${job.address}` : ""}</p>
        <table className="pq-table">
          <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead>
          <tbody>{inv.lines.map((l) => <tr key={l.id}><td>{l.description}</td><td>{l.quantity}</td><td>{money(l.unitPrice)}</td><td>{money(l.quantity * l.unitPrice)}</td></tr>)}</tbody>
        </table>
        <div className="pq-totals">
          <div className="pq-total"><span>Total</span><span>{money(inv.total)}</span></div>
          {data.payments.map((p, i) => <div key={i}><span>Paid ({p.method}, {new Date(p.receivedAt).toLocaleDateString("en-CA")})</span><span>-{money(p.amount)}</span></div>)}
          <div className="pq-total"><span>Balance due</span><span>{money(inv.balance)}</span></div>
        </div>
        {inv.aiSummary ? <div className="pq-block"><h3>Work summary</h3><p className="pq-pre">{inv.aiSummary}</p></div> : null}
        {inv.notes ? <div className="pq-block"><h3>Notes</h3><p className="pq-pre">{inv.notes}</p></div> : null}
        {!paid ? (
          <section className="pq-sign">
            <h2>Pay {money(inv.balance)}</h2>
            {error ? <p className="pq-error">{error}</p> : null}
            {data.etransferEmail ? (
              <div className="pq-block">
                <h3>Interac e-Transfer</h3>
                <p>
                  Send {money(inv.balance)} to <strong>{data.etransferEmail}</strong>{" "}
                  (auto-deposit — no security question needed). Put{" "}
                  {inv.number ?? "the invoice number"} in the message.
                </p>
              </div>
            ) : (
              <div className="pq-block">
                <h3>How to pay</h3>
                <p>
                  Card checkout is disabled. Please pay by Interac e-Transfer or
                  cheque using the details below, or contact the office.
                </p>
              </div>
            )}
            <div className="pq-block">
              <h3>Cheque</h3>
              <p>
                Payable to {c.name}. Questions? {c.phone} · {c.email}
              </p>
            </div>
          </section>
        ) : null}
        <footer className="pq-foot">{c.name} · {c.website}</footer>
      </div>
    </main>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={<main className="pq"><p className="pq-status">Loading payment…</p></main>}>
      <PayPageInner />
    </Suspense>
  );
}
