"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "./Sidebar";
import { AdminMobileNav } from "./MobileNav";
import { RequireAuth } from "./RequireAuth";
import { useSession } from "@/lib/session";
import { ROLE_LABELS, ADMIN_NAV } from "@/lib/types";
import { useEffect } from "react";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, can, logout, homePath } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    const allowedNav = ADMIN_NAV.filter((n) => can(n.perm));
    if (allowedNav.length === 0) {
      router.replace(homePath === "/admin/dashboard" ? "/apps" : homePath);
      return;
    }
    const match = ADMIN_NAV.find((n) => pathname.startsWith(n.href));
    if (match && !can(match.perm)) {
      router.replace(allowedNav[0].href);
    }
  }, [user, can, router, homePath, pathname]);

  function signOut() {
    logout();
    router.replace("/login");
  }

  return (
    <RequireAuth>
      <div className="admin-layout">
        <div className="admin-sidebar-wrap">
          <Sidebar pathname={pathname} />
        </div>
        <div className="admin-main">
          <header className="admin-topbar">
            <div className="admin-topbar-left">
              <p className="admin-topbar-brand mobile-only">BIG HOSS</p>
              <p className="admin-topbar-context desktop-only-block">
                {ADMIN_NAV.find((n) => pathname.startsWith(n.href))?.label ||
                  "Admin"}
              </p>
            </div>
            <div className="admin-topbar-right">
              {user ? (
                <div className="admin-identity">
                  <span className="admin-identity-name">{user.name}</span>
                  <span className="admin-identity-role">
                    {ROLE_LABELS[user.role]}
                  </span>
                </div>
              ) : null}
              {can("apps") ? (
                <Link href="/apps" className="topbar-link">
                  Apps
                </Link>
              ) : null}
              <button type="button" className="topbar-link" onClick={signOut}>
                Sign out
              </button>
            </div>
          </header>
          <AdminMobileNav />
          <main className="admin-content">{children}</main>
        </div>
      </div>
    </RequireAuth>
  );
}
