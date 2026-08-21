"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RequireAuth } from "./RequireAuth";
import { AppsDesktopNav, AppsMobileNav } from "./MobileNav";
import { useSession } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/types";

export function AppsShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const { user, logout, can } = useSession();
  const router = useRouter();

  function signOut() {
    logout();
    router.replace("/login");
  }

  return (
    <RequireAuth perm="apps">
      <div className="apps-layout">
        <header className="apps-topbar">
          <div>
            <p className="apps-brand">BHC APPS</p>
            {title ? <p className="apps-title">{title}</p> : null}
          </div>
          <div className="apps-topbar-right">
            {user ? (
              <span className="apps-user">
                {user.name.split(" ")[0]}
                <em>{ROLE_LABELS[user.role]}</em>
              </span>
            ) : null}
            {can("dashboard") ? (
              <Link href="/admin/dashboard" className="apps-link desktop-only">
                Admin
              </Link>
            ) : null}
            <button type="button" className="apps-link" onClick={signOut}>
              Out
            </button>
          </div>
        </header>
        <AppsDesktopNav />
        <main className="apps-content">{children}</main>
        <AppsMobileNav />
      </div>
    </RequireAuth>
  );
}
