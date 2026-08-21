"use client";

import Link from "next/link";
import { ADMIN_NAV } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";

export function Sidebar({ pathname }: { pathname: string }) {
  const { can, logout, user } = useSession();
  const items = ADMIN_NAV.filter((item) => can(item.perm));

  function signOut() {
    logout();
    if (typeof window !== "undefined") window.location.assign("/login");
  }

  return (
    <aside className="desktop-sidebar">
      <div className="sidebar-brand">
        <p className="sidebar-logo">BIG HOSS</p>
        <p className="sidebar-tag">Contracting CRM</p>
        {user ? (
          <p className="sidebar-user">
            {user.name}
            <span>{user.role}</span>
          </p>
        ) : null}
      </div>
      <nav className="sidebar-nav">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("sidebar-link", active && "sidebar-link-active")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        {can("apps") ? (
          <Link href="/apps" className="sidebar-cta">
            Field apps
          </Link>
        ) : null}
        <button type="button" className="sidebar-logout" onClick={signOut}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
