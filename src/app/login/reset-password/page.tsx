"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/session";
import { homeForRole, type Employee } from "@/lib/types";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";
  const router = useRouter();
  const { refresh } = useSession();
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [loginHint, setLoginHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!token) {
        setChecking(false);
        setValid(false);
        setError("Missing reset token. Use the link from your email.");
        return;
      }
      try {
        const res = await fetch(
          `/api/auth/reset-password?token=${encodeURIComponent(token)}`,
        );
        const json = (await res.json()) as {
          valid?: boolean;
          login?: string | null;
          error?: string;
        };
        if (cancelled) return;
        setValid(Boolean(json.valid));
        setLoginHint(json.login ?? null);
        if (!json.valid) {
          setError(json.error || "This reset link is invalid or has expired.");
        }
      } catch {
        if (!cancelled) {
          setValid(false);
          setError("Could not verify reset link");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("newPassword") || "");
    const confirm = String(form.get("confirm") || "");
    if (newPassword !== confirm) {
      setBusy(false);
      setError("Passwords do not match");
      return;
    }
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        employee?: Employee;
      };
      if (!res.ok || !json.employee) {
        setError(json.error || "Could not reset password");
        setBusy(false);
        return;
      }
      localStorage.setItem("bhc-auth-user-id", json.employee.id);
      await refresh();
      router.replace(homeForRole(json.employee.role));
    } catch {
      setError("Network error — try again");
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-panel">
        <div className="login-brand">
          <p className="login-eyebrow">BH Contracting LTD.</p>
          <h1 className="login-title">Choose a new password</h1>
          <p className="login-sub">
            {loginHint ? (
              <>
                Resetting password for <strong>{loginHint}</strong>.{" "}
              </>
            ) : null}
            Min 6 characters.{" "}
            <Link href="/login/forgot-password" className="login-home-link">
              Request a new link
            </Link>
          </p>
        </div>

        {checking ? (
          <p className="login-sub">Checking reset link…</p>
        ) : !valid ? (
          <div>
            <p className="login-error">{error || "Invalid reset link"}</p>
            <Link
              href="/login/forgot-password"
              className="btn-primary login-submit inline-flex"
            >
              Request a new reset email
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="login-form">
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
              {busy ? "Saving…" : "Save and sign in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="login-shell">
          <div className="login-panel">
            <p className="login-sub">Loading…</p>
          </div>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
