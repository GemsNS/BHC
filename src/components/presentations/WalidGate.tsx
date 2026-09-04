"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type StatusResponse = {
  ok: boolean;
  unlocked: boolean;
  title?: string;
  customerName?: string;
  address?: string;
  error?: string;
};

export function WalidGate({ slug }: { slug: string }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/presentations/${slug}/status`);
    const json = (await res.json()) as StatusResponse;
    setStatus(json);
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onUnlock(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/presentations/${slug}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Incorrect password");
        return;
      }
      setPassword("");
      await refresh();
    } catch {
      setError("Could not unlock. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <div className="walid-shell walid-lock">
        <p className="walid-muted">Loading presentation…</p>
      </div>
    );
  }

  if (!status.unlocked) {
    return (
      <div className="walid-shell walid-lock">
        <div className="walid-lock-card">
          <p className="walid-eyebrow">BH Contracting LTD.</p>
          <h1>{status.title || "Customer presentation"}</h1>
          {status.customerName ? <p className="walid-lede">{status.customerName}</p> : null}
          {status.address ? <p className="walid-muted">{status.address}</p> : null}
          <form onSubmit={onUnlock} className="walid-lock-form">
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error ? (
              <p className="walid-error" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={busy}>
              {busy ? "Checking…" : "Open presentation"}
            </button>
          </form>
          <p className="walid-fine">Private link — do not share the password publicly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="walid-shell walid-manus-host">
      <div className="walid-manus-bar">
        <div>
          <p className="walid-eyebrow">BH Contracting LTD.</p>
          <strong>Walid warehouse presentation</strong>
        </div>
        <div className="walid-manus-actions">
          <a className="walid-download-main" href={`/presentations/${slug}/view`}>
            Open fullscreen
          </a>
          <Link className="walid-raw-link" href={`/presentations/${slug}/raw`}>
            Raw package view
          </Link>
          <a
            className="walid-raw-link"
            href={`/presentations/${slug}/files/BH_Contracting_Walid_Complete_Package.zip`}
          >
            Download ZIP
          </a>
        </div>
      </div>
      <iframe
        className="walid-manus-frame"
        title="Walid private presentation"
        src={`/presentations/${slug}/view`}
      />
    </div>
  );
}
