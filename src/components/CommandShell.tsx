"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { RequireAuth } from "./RequireAuth";
import { useSession } from "@/lib/session";
import { ADMIN_NAV, ROLE_LABELS } from "@/lib/types";
import type { Permission } from "@/lib/types";
import { cn } from "@/lib/utils";

const APP_TABS: Array<{
  href: string;
  label: string;
  perm: Permission;
  exact?: boolean;
}> = [
  { href: "/apps", label: "Home", perm: "apps", exact: true },
  { href: "/apps/board", label: "Board", perm: "board" },
  { href: "/apps/progress", label: "Progress", perm: "progress" },
  { href: "/apps/tools", label: "Tools", perm: "tools" },
  { href: "/apps/knocker", label: "Knock", perm: "knocker" },
  { href: "/apps/clock", label: "Clock", perm: "clock" },
];

function CommandRail({
  pathname,
  mode,
}: {
  pathname: string;
  mode: "admin" | "apps";
}) {
  const { can, logout, user } = useSession();
  const router = useRouter();
  const adminItems = ADMIN_NAV.filter((item) => can(item.perm));
  const appItems = APP_TABS.filter((t) => can(t.perm));

  function signOut() {
    logout();
    router.replace("/login");
  }

  return (
    <aside className="cc-rail">
      <div className="cc-rail-brand">
        <p className="cc-rail-logo">BHC</p>
        <p className="cc-rail-tag">Command Center</p>
        {user ? (
          <p className="cc-rail-user">
            {user.name}
            <span>{ROLE_LABELS[user.role]}</span>
          </p>
        ) : null}
      </div>

      {mode === "admin" ? (
        <nav className="cc-rail-nav" aria-label="Ops sections">
          {adminItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "cc-rail-link",
                pathname.startsWith(item.href) && "cc-rail-link-active",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : (
        <nav className="cc-rail-nav" aria-label="Field modes">
          {appItems.map((tab) => {
            const active = tab.exact
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn("cc-rail-link", active && "cc-rail-link-active")}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="cc-rail-foot">
        {mode === "admin" && can("apps") ? (
          <Link href="/apps" className="cc-rail-cta">
            Field modes
          </Link>
        ) : null}
        {mode === "apps" && can("dashboard") ? (
          <Link href="/admin/dashboard" className="cc-rail-cta">
            Ops wall
          </Link>
        ) : null}
        <button type="button" className="cc-rail-logout" onClick={signOut}>
          Sign out
        </button>
      </div>
    </aside>
  );
}

function MobileSectionNav({ pathname }: { pathname: string }) {
  const { can } = useSession();
  const items = ADMIN_NAV.filter((item) => can(item.perm));
  return (
    <nav className="cc-mobile-scroll" aria-label="Ops sections">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "cc-chip",
            pathname.startsWith(item.href) && "cc-chip-active",
          )}
        >
          {item.label.split(" ")[0]}
        </Link>
      ))}
      {can("apps") ? (
        <Link href="/apps" className="cc-chip">
          Apps
        </Link>
      ) : null}
    </nav>
  );
}

function MobileBottomBar({ pathname }: { pathname: string }) {
  const { can } = useSession();
  const tabs = APP_TABS.filter((t) => can(t.perm));
  return (
    <nav className="cc-bottom-bar" aria-label="Field apps">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn("cc-bottom-tab", active && "cc-bottom-tab-active")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function CommandShell({
  children,
  mode,
  title,
}: {
  children: React.ReactNode;
  mode: "admin" | "apps";
  title?: string;
}) {
  const pathname = usePathname();
  const { user, can, logout, homePath } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!user || mode !== "admin") return;
    const allowedNav = ADMIN_NAV.filter((n) => can(n.perm));
    if (allowedNav.length === 0) {
      router.replace(homePath === "/admin/dashboard" ? "/apps" : homePath);
      return;
    }
    const match = ADMIN_NAV.find((n) => pathname.startsWith(n.href));
    if (match && !can(match.perm)) {
      router.replace(allowedNav[0].href);
    }
  }, [user, can, router, homePath, pathname, mode]);

  function signOut() {
    logout();
    router.replace("/login");
  }

  const contextLabel =
    mode === "admin"
      ? ADMIN_NAV.find((n) => pathname.startsWith(n.href))?.label || "Ops"
      : title ||
        APP_TABS.find((t) =>
          t.exact ? pathname === t.href : pathname.startsWith(t.href),
        )?.label ||
        "Field";

  const shiftContext = `Today · ${new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })}`;

  return (
    <RequireAuth perm={mode === "apps" ? "apps" : undefined}>
      <div className={cn("cc-shell", mode === "apps" && "cc-shell-apps")}>
        <div className="cc-rail-wrap">
          <CommandRail pathname={pathname} mode={mode} />
        </div>
        <div className="cc-main">
          <header className="cc-topbar">
            <div className="cc-topbar-left">
              <p className="cc-topbar-brand mobile-only">BHC</p>
              <div className="desktop-only-block">
                <p className="cc-topbar-context">{contextLabel}</p>
                <p className="cc-topbar-shift">{shiftContext}</p>
              </div>
            </div>
            <div className="cc-topbar-right">
              {user ? (
                <div className="cc-identity">
                  <span className="cc-identity-name">{user.name}</span>
                  <span className="cc-identity-role">
                    {ROLE_LABELS[user.role]}
                  </span>
                </div>
              ) : null}
              {mode === "admin" && can("apps") ? (
                <Link href="/apps" className="cc-topbar-link">
                  Field
                </Link>
              ) : null}
              {mode === "apps" && can("dashboard") ? (
                <Link
                  href="/admin/dashboard"
                  className="cc-topbar-link desktop-only"
                >
                  Ops
                </Link>
              ) : null}
              <button
                type="button"
                className="cc-topbar-link"
                onClick={signOut}
              >
                Sign out
              </button>
            </div>
          </header>
          {mode === "admin" ? <MobileSectionNav pathname={pathname} /> : null}
          <main className="cc-content">{children}</main>
          {mode === "apps" ? <MobileBottomBar pathname={pathname} /> : null}
        </div>
      </div>
    </RequireAuth>
  );
}
