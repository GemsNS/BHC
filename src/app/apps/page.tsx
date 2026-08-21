"use client";

import Link from "next/link";
import { useSession } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/types";
import { withBasePath } from "@/lib/paths";

const apps = [
  {
    href: "/apps/knocker",
    title: "Knocker",
    blurb: "Zone-assigned door knocking. Log every door; syncs to admin live.",
    perm: "knocker" as const,
    accent: "from-[#1f4e5f] to-[#243039]",
  },
  {
    href: "/apps/clock",
    title: "Time clock",
    blurb: "Clock in/out against jobs from any phone.",
    perm: "clock" as const,
    accent: "from-[#b45309] to-[#1a1d21]",
  },
  {
    href: "/admin/dashboard",
    title: "Admin panel",
    blurb: "Jobs, materials, fuel, fleet, stats, and zone control.",
    perm: "admin" as const,
    accent: "from-[#1a1d21] to-[#1f4e5f]",
  },
];

export default function AppsHubPage() {
  const { user, employees, setUserId, can, loading } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--ink)] text-white">
        Loading apps…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--foam)]">
      <div className="mx-auto max-w-lg px-5 py-8">
        <header className="mb-8">
          <p className="font-[family-name:var(--font-display)] text-3xl tracking-wide text-[var(--amber)]">
            BHC APPS
          </p>
          <p className="mt-1 text-sm text-white/55">
            Web-hosted field tools — install to home screen for app-like use.
          </p>
          <label className="mt-4 flex flex-col gap-1 text-xs uppercase tracking-[0.14em] text-white/45">
            Signed in as
            <select
              className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm normal-case tracking-normal text-white"
              value={user?.id || ""}
              onChange={(e) => setUserId(e.target.value)}
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} — {ROLE_LABELS[e.role]}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div className="grid gap-4">
          {apps.map((app) => {
            const allowed = can(app.perm);
            return (
              <Link
                key={app.href}
                href={allowed ? app.href : "#"}
                aria-disabled={!allowed}
                className={`block rounded-2xl bg-gradient-to-br ${app.accent} p-5 transition ${
                  allowed ? "opacity-100 hover:scale-[1.01]" : "pointer-events-none opacity-35"
                }`}
              >
                <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-wide">
                  {app.title}
                </h2>
                <p className="mt-2 text-sm text-white/75">{app.blurb}</p>
                {!allowed ? (
                  <p className="mt-3 text-xs text-white/50">No access for your role</p>
                ) : null}
              </Link>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-white/40">
          Tip: on iPhone/Android, open Knocker → Share/Menu → Add to Home Screen.
          Manifest:{" "}
          <a className="underline" href={withBasePath("/manifest.webmanifest")}>
            PWA manifest
          </a>
        </p>
        <Link href="/" className="mt-4 block text-center text-sm text-white/50 hover:text-[var(--amber)]">
          ← Home
        </Link>
      </div>
    </div>
  );
}
