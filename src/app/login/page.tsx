"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { homeForRole, ROLE_LABELS } from "@/lib/types";

const DEMO_ACCOUNTS = [
  { login: "cameron", pin: "1001", role: "Admin" },
  { login: "jamie", pin: "1007", role: "Knocker" },
  { login: "sam", pin: "1003", role: "Field" },
  { login: "riley", pin: "1005", role: "Driver" },
];

export default function LoginPage() {
  const { login, authenticated, homePath, loading } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && authenticated) router.replace(homePath);
  }, [loading, authenticated, homePath, router]);

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
    router.replace(emp ? homeForRole(emp.role) : "/apps");
  }

  function fillDemo(loginName: string, pin: string) {
    const loginEl = document.getElementById("login") as HTMLInputElement | null;
    const pinEl = document.getElementById("pin") as HTMLInputElement | null;
    if (loginEl) loginEl.value = loginName;
    if (pinEl) pinEl.value = pin;
  }

  return (
    <div className="login-shell">
      <div className="login-panel">
        <div className="login-brand">
          <p className="login-eyebrow">Big Hoss Contracting</p>
          <h1 className="login-title">Sign in</h1>
          <p className="login-sub">
            Your role unlocks only the tools you need — admin desk or field apps.{" "}
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
              placeholder="cameron"
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
              placeholder="••••"
              className="field-input"
            />
          </label>
          {error ? <p className="login-error">{error}</p> : null}
          <button type="submit" disabled={busy} className="login-submit">
            {busy ? "Signing in…" : "Enter workspace"}
          </button>
        </form>

        <div className="demo-accounts">
          <p className="demo-label">Demo accounts — tap to fill</p>
          <div className="demo-grid">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.login}
                type="button"
                className="demo-chip"
                onClick={() => fillDemo(a.login, a.pin)}
              >
                <strong>{a.role}</strong>
                <span>
                  {a.login} / {a.pin}
                </span>
              </button>
            ))}
          </div>
          <p className="demo-hint">
            Roles: {Object.values(ROLE_LABELS).join(" · ")}
          </p>
        </div>
      </div>
      <div className="login-visual" aria-hidden>
        <div className="login-visual-inner">
          <p className="login-visual-brand">BHC</p>
          <p className="login-visual-tag">
            Subcontracting ops — knocks to closeout.
          </p>
        </div>
      </div>
    </div>
  );
}
