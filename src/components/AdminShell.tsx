"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "./Sidebar";
import { useSession } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/types";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, employees, setUserId, can } = useSession();

  return (
    <div className="flex min-h-screen bg-[var(--paper)]">
      <div className="sticky top-0 hidden h-screen md:block">
        <Sidebar pathname={pathname} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-white/80 px-4 py-3 backdrop-blur">
          <div className="md:hidden">
            <p className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
              BIG HOSS
            </p>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2 text-sm">
            <label className="flex items-center gap-2 text-[var(--muted)]">
              Acting as
              <select
                className="rounded-md border border-[var(--line)] bg-white px-2 py-1 text-[var(--ink)]"
                value={user?.id || ""}
                onChange={(e) => setUserId(e.target.value)}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({ROLE_LABELS[e.role]})
                  </option>
                ))}
              </select>
            </label>
            {can("manage_users") ? (
              <Link href="/admin/users" className="text-[var(--sea)]">
                Roles
              </Link>
            ) : null}
            <Link href="/apps" className="text-[var(--sea)]">
              Apps
            </Link>
          </div>
          <div className="flex w-full gap-2 overflow-x-auto text-sm md:hidden">
            {[
              ["/admin/dashboard", "Dash"],
              ["/admin/stats", "Stats"],
              ["/admin/zones", "Zones"],
              ["/admin/jobs", "Jobs"],
              ["/admin/materials", "Mats"],
              ["/admin/fuel", "Fuel"],
              ["/admin/users", "Users"],
              ["/apps/knocker", "Knock"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="whitespace-nowrap rounded-full border border-[var(--line)] px-3 py-1"
              >
                {label}
              </a>
            ))}
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
