"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/session";
import { homeForRole } from "@/lib/types";

function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

function LoginForm() {
  const { login, authenticated, homePath, loading } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && authenticated) router.replace(nextPath || homePath);
  }, [loading, authenticated, homePath, nextPath, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const loginName = String(form.get("login") || "");
    const pin = String(form.get("pin") || "");
    const result = await login(loginName, pin);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const { loadAppData } = await import("@/lib/client-data");
    const data = await loadAppData();
    const normalized = loginName.trim().toLowerCase();
    const emp = data.employees.find(
      (x) =>
        x.login.toLowerCase() === normalized ||
        x.email.toLowerCase() === normalized,
    );
    router.replace(nextPath || (emp ? homeForRole(emp.role) : "/apps"));
  }

  return (
    <div className="login-shell">
      <div className="login-panel">
        <div className="login-brand">
          <p className="login-eyebrow">BH Contracting Co.</p>
          <h1 className="login-title">Sign in</h1>
          <p className="login-sub">
            Staff workspace — Halifax Regional Municipality ops.{" "}
            <Link href="/" className="login-home-link">
              ← Public site
            </Link>
          </p>
        </div>

        <form onSubmit={onSubmit} className="login-form">
          <label className="field">
            <span>Login</span>
            <input
              id="login"
              name="login"
              required
              autoComplete="username"
              placeholder="your login"
              className="field-input"
            />
          </label>
          <label className="field">
            <span>PIN</span>
            <input
              id="pin"
              name="pin"
              required
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              placeholder="••••••"
              className="field-input"
            />
          </label>
          {error ? <p className="login-error">{error}</p> : null}
          <button type="submit" disabled={busy} className="btn-primary login-submit">
            {busy ? "Signing in…" : "Enter workspace"}
          </button>
        </form>

        <p className="login-sub" style={{ marginTop: "1.25rem", fontSize: "0.85rem" }}>
          Credentials are issued by your administrator. Contact ops if you need access.
        </p>
      </div>
      <div className="login-visual" aria-hidden>
        <p className="login-visual-brand">BH</p>
        <p className="login-visual-tag">HRM contracting ops — knocks to closeout.</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-shell">
          <div className="login-panel">
            <p className="login-sub">Loading sign-in…</p>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
