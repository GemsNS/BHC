"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/session";

function SetPasswordForm() {
  const { setPassword, user, homePath } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const current = String(form.get("current") || "");
    const nextPassword = String(form.get("newPassword") || "");
    const confirm = String(form.get("confirm") || "");
    if (nextPassword !== confirm) {
      setBusy(false);
      setError("Passwords do not match");
      return;
    }
    const result = await setPassword(current, nextPassword);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace(next && next.startsWith("/") ? next : homePath);
  }

  if (!user) {
    return <p className="login-sub">Sign in first.</p>;
  }

  return (
    <div className="login-shell">
      <div className="login-panel">
        <div className="login-brand">
          <p className="login-eyebrow">BH Contracting LTD.</p>
          <h1 className="login-title">Set your password</h1>
          <p className="login-sub">
            Welcome {user.name}. Choose a password (min 6 characters) to secure your account.
          </p>
        </div>
        <form onSubmit={onSubmit} className="login-form">
          <label className="field">
            <span>Current PIN / password</span>
            <input
              name="current"
              type="password"
              required
              autoComplete="current-password"
              className="field-input"
            />
          </label>
          <label className="field">
            <span>New password</span>
            <input
              name="newPassword"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="field-input"
            />
          </label>
          <label className="field">
            <span>Confirm password</span>
            <input
              name="confirm"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              className="field-input"
            />
          </label>
          {error ? <p className="login-error">{error}</p> : null}
          <button type="submit" disabled={busy} className="btn-primary login-submit">
            {busy ? "Saving…" : "Save password"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<p className="login-sub">Loading…</p>}>
      <SetPasswordForm />
    </Suspense>
  );
}
