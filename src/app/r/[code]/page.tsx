"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import "../../q/[token]/quote.css";

export default function ReferralPage() {
  const { code } = useParams<{ code: string }>();
  const [referrer, setReferrer] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/referral/${code}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setReferrer(j.referrerFirstName))
      .catch(() => setInvalid(true));
  }, [code]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/public/referral/${code}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: fd.get("name"), phone: fd.get("phone"), email: fd.get("email"), address: fd.get("address"), city: fd.get("city"), details: fd.get("details"), jobType: fd.get("jobType") }) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Could not submit");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pq">
      <div className="pq-card">
        <header className="pq-head"><div><p className="pq-brand">BH Contracting LTD.</p><p className="pq-meta">Siding · soffit & fascia · decks · windows & doors · exterior work in HRM</p></div></header>
        {invalid ? <><h1 className="pq-h1">Link not valid</h1><p>Ask the person who referred you for a fresh link, or visit bhcontracting.ca.</p></> : done ? (
          <section className="pq-done"><h2>Thanks — we&apos;ll call you within one business day.</h2><p>Cameron or a crew lead will reach out to arrange a free look at the job and a written quote.</p></section>
        ) : (
          <>
            <h1 className="pq-h1">{referrer ? `${referrer} sent you our way` : "Referred to BH Contracting"}</h1>
            <p className="pq-meta">Tell us a little about the work and we&apos;ll come out for a free written quote. No pressure, no obligation.</p>
            <form onSubmit={submit} className="pq-sign" style={{ borderTop: 0, marginTop: "1rem", paddingTop: 0 }}>
              <div className="pq-fields">
                <label>Your name *<input name="name" required /></label>
                <label>Phone *<input name="phone" required type="tel" /></label>
                <label>Email<input name="email" type="email" /></label>
                <label>Town<input name="city" placeholder="Dartmouth" /></label>
                <label>Address<input name="address" /></label>
                <label>Type<select name="jobType" defaultValue="residential"><option value="residential">Home</option><option value="commercial">Commercial / building</option></select></label>
              </div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "#5c6670" }}>What do you need done?<textarea name="details" style={{ display: "block", width: "100%", minHeight: 90, marginTop: 4, font: "inherit", padding: "0.55rem 0.7rem", border: "1px solid #cfd6dd", borderRadius: 8 }} placeholder="e.g. Replace vinyl siding on a bungalow, some rot on the north side" /></label>
              {error ? <p className="pq-error">{error}</p> : null}
              <div className="pq-actions"><button type="submit" className="pq-btn" disabled={busy}>{busy ? "Sending…" : "Request a free quote"}</button></div>
            </form>
          </>
        )}
        <footer className="pq-foot">BH Contracting LTD. · bhcontracting.ca</footer>
      </div>
    </main>
  );
}
