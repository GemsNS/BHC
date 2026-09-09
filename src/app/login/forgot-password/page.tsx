"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const loginOrEmail = String(form.get("loginOrEmail") || "").trim();
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginOrEmail }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error || "Could not start password reset");
      } else {
        setMessage(
          json.message ||
            "If that login or email is on file, we sent reset instructions.",
        );
        e.currentTarget.reset();
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-panel">
        <div className="login-brand">
          <p className="login-eyebrow">BH Contracting LTD.</p>
          <h1 className="login-title">Forgot password</h1>
          <p className="login-sub">
            Enter your login or work email. We&apos;ll send a one-hour reset link
            if the account exists.{" "}
            <Link href="/login" className="login-home-link">
              ← Back to sign in
            </Link>
          </p>
        </div>

        <form onSubmit={onSubmit} className="login-form">
          <label className="field">
            <span>Login or email</span>
            <input
              name="loginOrEmail"
              required
              autoComplete="username"
              placeholder="admin or you@bhcontracting.ca"
              className="field-input"
            />
          </label>
          {error ? <p className="login-error">{error}</p> : null}
          {message ? <p className="login-sub" style={{ color: "#3d8b6e" }}>{message}</p> : null}
          <button type="submit" disabled={busy} className="btn-primary login-submit">
            {busy ? "Sending…" : "Email reset link"}
          </button>
        </form>
      </div>
      <div className="login-visual" aria-hidden>
        <p className="login-visual-brand">BH</p>
        <p className="login-visual-tag">Secure password recovery.</p>
      </div>
    </div>
  );
}
