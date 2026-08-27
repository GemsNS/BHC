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
import { MainframeLauncher } from "./mainframe/MainframeLauncher";
import { CommandRail, useRailCollapsed, APP_FIELD_TABS } from "./CommandRail";

function canSeeSales(can: (p: Permission) => boolean) {
  return (
    can("leads") ||
    can("crm") ||
    can("workflows") ||
    can("tickets") ||
    can("outreach")
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
  const tabs = APP_FIELD_TABS.filter((t) => can(t.perm));
  const showOpsReturn = can("dashboard");
  return (
    <nav className="cc-bottom-bar" aria-label="Field apps">
      {showOpsReturn ? (
        <Link
          href="/admin/dashboard"
          className="cc-bottom-tab cc-bottom-tab-ops"
          title="Back to admin ops"
        >
          Ops
        </Link>
      ) : null}
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
      // Never bounce desk users into field apps — land on role home or login.
      router.replace(homePath.startsWith("/admin") ? homePath : "/login");
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

  const [railCollapsed, toggleRailCollapsed] = useRailCollapsed();

  const contextLabel =
    mode === "admin"
      ? pathname.startsWith("/admin/sales")
        ? "Pipeline & clients"
        : navItemForPath(pathname)?.label || sectionForPath(pathname)?.label || "Overview"
      : title ||
        APP_FIELD_TABS.find((t) =>
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
  const isAssistantPage = mode === "admin" && pathname.startsWith("/admin/assistant");
  const isImmersiveChrome = isDeck || isTerminal;

  return (
    <RequireAuth perm={mode === "apps" ? "apps" : undefined}>
      <CommandPalette />
      <div
        className={cn(
          "cc-shell",
          mode === "apps" && "cc-shell-apps",
          railCollapsed && "cc-shell-rail-collapsed",
          isDeck && "cc-shell-immersive",
          isTerminal && "cc-shell-terminal",
          mode === "admin" && !isImmersiveChrome && "cc-shell-command",
        )}
      >
        <div className="cc-rail-wrap">
          <CommandRail
            mode={mode}
            collapsed={railCollapsed}
            onToggleCollapsed={toggleRailCollapsed}
          />
        </div>
        <div className="cc-main">
          {!isImmersiveChrome ? <CommandAtmosphere /> : null}
          {isImmersiveChrome ? (
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
                  <Link href="/apps" className="cc-topbar-link" title="Switch to field apps">
                    Field
                  </Link>
                ) : null}
                {mode === "apps" && can("dashboard") ? (
                  <Link
                    href="/admin/dashboard"
                    className="cc-topbar-link cc-topbar-link-ops"
                    title="Back to admin ops / Jarvis"
                  >
                    Ops
                  </Link>
                ) : null}
                <button type="button" className="cc-topbar-link" onClick={signOut}>
                  Sign out
                </button>
              </div>
            </header>
          )}
          {!isImmersiveChrome && !isAssistantPage ? <JarvisBar /> : null}
          {mode === "admin" && !isImmersiveChrome ? (
            <MobileSectionNav pathname={pathname} />
          ) : null}
          <main
            key={pathname}
            className={cn(
              "cc-content",
              !isImmersiveChrome && "jarvis-content",
              isDeck && "cc-content-deck",
              isTerminal && "cc-content-terminal",
              isAssistantPage && "cc-content-assistant",
              !isTerminal && "command-page-enter",
            )}
          >
            {children}
          </main>
          {mode === "apps" ? <MobileBottomBar pathname={pathname} /> : null}
          {mode === "admin" && !isDeck ? <MainframeLauncher /> : null}
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
