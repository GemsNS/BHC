"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RequireAuth } from "./RequireAuth";
import { useSession } from "@/lib/session";
import {
  ADMIN_NAV,
  ADMIN_NAV_SECTIONS,
  navItemForPath,
  sectionForPath,
} from "@/lib/nav";
import type { Permission } from "@/lib/types";
import { cn } from "@/lib/utils";
import { JarvisBar } from "./JarvisBar";
import { CommandPalette, CommandPaletteTrigger } from "./CommandPalette";
import { CommandAtmosphere } from "./CommandAtmosphere";

const APP_TABS: Array<{
  href: string;
  label: string;
  perm: Permission;
  exact?: boolean;
}> = [
  { href: "/apps", label: "Home", perm: "apps", exact: true },
  { href: "/apps/schedule", label: "Schedule", perm: "schedule" },
  { href: "/apps/board", label: "Board", perm: "board" },
  { href: "/apps/progress", label: "Progress", perm: "progress" },
  { href: "/apps/tools", label: "Tools", perm: "tools" },
  { href: "/apps/knocker", label: "Knock", perm: "knocker" },
  { href: "/apps/clock", label: "Clock", perm: "clock" },
];

function canSeeSales(can: (p: Permission) => boolean) {
  return (
    can("leads") ||
    can("crm") ||
    can("workflows") ||
    can("tickets") ||
    can("outreach")
  );
}

function CommandRail({
  pathname,
  mode,
}: {
  pathname: string;
  mode: "admin" | "apps";
}) {
  const { can, logout, user } = useSession();
  const router = useRouter();
  const appItems = APP_TABS.filter((t) => can(t.perm));

  function signOut() {
    logout();
    router.replace("/login");
  }

  return (
    <aside className="cc-rail">
      <div className="cc-rail-brand">
        <p className="cc-rail-logo">BHC</p>
        <p className="cc-rail-tag">Intelligence layer</p>
        {user ? (
          <p className="cc-rail-user">
            {user.name}
            <span>{user.role}</span>
          </p>
        ) : null}
      </div>

      {mode === "admin" ? (
        <nav className="cc-rail-nav cc-rail-nav-grouped" aria-label="Ops sections">
          {ADMIN_NAV_SECTIONS.map((section) => {
            const items = section.items.filter((item) => {
              if (item.href === "/admin/sales") return canSeeSales(can);
              return can(item.perm);
            });
            if (!items.length) return null;
            return (
              <div key={section.id} className="cc-nav-section">
                <p className="cc-nav-section-label">{section.label}</p>
                {items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "cc-rail-link",
                      (pathname.startsWith(item.href) ||
                        (item.href === "/admin/sales" &&
                          pathname.startsWith("/admin/sales"))) &&
                        "cc-rail-link-active",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            );
          })}
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
            Overview
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
  const chips = ADMIN_NAV_SECTIONS.flatMap((section) =>
    section.items
      .filter((item) => {
        if (item.href === "/admin/sales") return canSeeSales(can);
        return can(item.perm);
      })
      .map((item) => ({
        href: item.href,
        short: item.short ?? item.label.split(" ")[0],
      })),
  );

  return (
    <nav className="cc-mobile-scroll" aria-label="Ops sections">
      {chips.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "cc-chip",
            pathname.startsWith(item.href) && "cc-chip-active",
          )}
        >
          {item.short}
        </Link>
      ))}
      {can("apps") ? (
        <Link href="/apps" className="cc-chip">
          Field
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

function CommandShellInner({
  children,
  mode,
  title,
}: {
  children: React.ReactNode;
  mode: "admin" | "apps";
  title?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, can, logout, homePath } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!user || mode !== "admin") return;
    const allowedNav = ADMIN_NAV.filter((n) => {
      if (n.href === "/admin/sales") return canSeeSales(can);
      return can(n.perm);
    });
    if (allowedNav.length === 0) {
      router.replace(homePath === "/admin/dashboard" ? "/apps" : homePath);
      return;
    }
    const match = ADMIN_NAV.find((n) => pathname.startsWith(n.href));
    if (match && match.href !== "/admin/sales" && !can(match.perm)) {
      router.replace(allowedNav[0].href);
    }
  }, [user, can, router, homePath, pathname, mode]);

  function signOut() {
    logout();
    router.replace("/login");
  }

  const contextLabel =
    mode === "admin"
      ? pathname.startsWith("/admin/sales")
        ? "Pipeline & clients"
        : navItemForPath(pathname)?.label || sectionForPath(pathname)?.label || "Overview"
      : title ||
        APP_TABS.find((t) =>
          t.exact ? pathname === t.href : pathname.startsWith(t.href),
        )?.label ||
        "Field";

  const shiftContext = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const isDeck =
    mode === "admin" &&
    pathname.startsWith("/admin/dashboard") &&
    searchParams.get("classic") !== "1";

  const isTerminal = mode === "admin" && pathname.startsWith("/admin/markets");

  return (
    <RequireAuth perm={mode === "apps" ? "apps" : undefined}>
      <CommandPalette />
      <div
        className={cn(
          "cc-shell",
          mode === "apps" && "cc-shell-apps",
          isDeck && "cc-shell-immersive",
          mode === "admin" && !isDeck && "cc-shell-command",
        )}
      >
        {!isDeck ? <CommandAtmosphere /> : null}
        <div className="cc-rail-wrap">
          <CommandRail pathname={pathname} mode={mode} />
        </div>
        <div className="cc-main">
          {isDeck ? (
            <div className="hud-minimal-chrome">
              <CommandPaletteTrigger />
              <button type="button" className="cc-topbar-link" onClick={signOut}>
                Sign out
              </button>
            </div>
          ) : (
            <header className="cc-topbar">
              <div className="cc-topbar-left">
                <p className="cc-topbar-brand mobile-only">BHC</p>
                <div className="desktop-only-block">
                  <p className="cc-topbar-context">{contextLabel}</p>
                  <p className="cc-topbar-shift">{shiftContext}</p>
                </div>
              </div>
              <div className="cc-topbar-right">
                <CommandPaletteTrigger />
                {user ? (
                  <div className="cc-identity desktop-only">
                    <span className="cc-identity-name">{user.name}</span>
                    <span className="cc-identity-role">{user.role}</span>
                  </div>
                ) : null}
                {mode === "admin" && can("apps") ? (
                  <Link href="/apps" className="cc-topbar-link">
                    Field
                  </Link>
                ) : null}
                {mode === "apps" && can("dashboard") ? (
                  <Link href="/admin/dashboard" className="cc-topbar-link desktop-only">
                    Overview
                  </Link>
                ) : null}
                <button type="button" className="cc-topbar-link" onClick={signOut}>
                  Sign out
                </button>
              </div>
            </header>
          )}
          {!isDeck ? <JarvisBar /> : null}
          {mode === "admin" && !isDeck ? (
            <MobileSectionNav pathname={pathname} />
          ) : null}
          <main
            key={pathname}
            className={cn(
              "cc-content",
              !isDeck && "jarvis-content",
              isDeck && "cc-content-deck",
              isTerminal && "cc-content-terminal",
              "command-page-enter",
            )}
          >
            {children}
          </main>
          {mode === "apps" ? <MobileBottomBar pathname={pathname} /> : null}
        </div>
      </div>
    </RequireAuth>
  );
}

export function CommandShell(props: {
  children: React.ReactNode;
  mode: "admin" | "apps";
  title?: string;
}) {
  return (
    <Suspense fallback={<p className="hud-loading">Loading…</p>}>
      <CommandShellInner {...props} />
    </Suspense>
  );
}
