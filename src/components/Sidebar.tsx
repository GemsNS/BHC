import Link from "next/link";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/stats", label: "Statistics" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/materials", label: "Materials" },
  { href: "/admin/zones", label: "Knocker zones" },
  { href: "/admin/canvass", label: "Door-to-Door" },
  { href: "/admin/fleet", label: "Fleet" },
  { href: "/admin/fuel", label: "Fuel" },
  { href: "/admin/hours", label: "Hours & Payroll" },
  { href: "/admin/users", label: "Users & roles" },
  { href: "/admin/team", label: "Team" },
];

export function Sidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-[var(--line)] bg-[var(--ink)] text-[var(--foam)]">
      <div className="border-b border-white/10 px-5 py-6">
        <p className="font-[family-name:var(--font-display)] text-2xl tracking-wide text-[var(--amber)]">
          BIG HOSS
        </p>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-white/55">
          Contracting CRM
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {nav.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-[var(--amber)] text-[var(--ink)] font-semibold"
                  : "text-white/75 hover:bg-white/5 hover:text-white",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4 space-y-2">
        <Link
          href="/apps"
          className="block rounded-md bg-[var(--amber)] px-3 py-2 text-center text-sm font-semibold text-[var(--ink)]"
        >
          Field apps
        </Link>
        <Link
          href="/apps/knocker"
          className="block rounded-md border border-white/15 px-3 py-2 text-center text-sm text-white/80 transition hover:border-[var(--amber)] hover:text-[var(--amber)]"
        >
          Knocker app
        </Link>
        <Link
          href="/"
          className="mt-1 block text-center text-xs text-white/40 hover:text-white/70"
        >
          Back to home
        </Link>
      </div>
    </aside>
  );
}
