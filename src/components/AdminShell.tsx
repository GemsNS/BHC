"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen bg-[var(--paper)]">
      <div className="sticky top-0 hidden h-screen md:block">
        <Sidebar pathname={pathname} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--line)] bg-white/80 px-4 py-3 backdrop-blur md:hidden">
          <p className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            BIG HOSS
          </p>
          <div className="mt-2 flex gap-2 overflow-x-auto text-sm">
            {[
              ["/admin/dashboard", "Dashboard"],
              ["/admin/leads", "Leads"],
              ["/admin/jobs", "Jobs"],
              ["/admin/canvass", "Canvass"],
              ["/admin/fleet", "Fleet"],
              ["/admin/hours", "Hours"],
              ["/admin/team", "Team"],
              ["/portal", "Portal"],
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
