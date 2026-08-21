"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";

/** Mobile bottom / top condensed nav for admin */
export function AdminMobileNav() {
  const pathname = usePathname();
  const { can } = useSession();
  const items = ADMIN_NAV.filter((item) => can(item.perm));

  return (
    <nav className="mobile-admin-nav" aria-label="Admin sections">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "mobile-admin-link",
            pathname.startsWith(item.href) && "mobile-admin-link-active",
          )}
        >
          {item.label.split(" ")[0]}
        </Link>
      ))}
      {can("apps") ? (
        <Link href="/apps" className="mobile-admin-link">
          Apps
        </Link>
      ) : null}
    </nav>
  );
}

const APP_TABS = [
  { href: "/apps", label: "Home", perm: "apps" as const, exact: true },
  { href: "/apps/board", label: "Board", perm: "board" as const },
  { href: "/apps/knocker", label: "Knock", perm: "knocker" as const },
  { href: "/apps/clock", label: "Clock", perm: "clock" as const },
];

export function AppsMobileNav() {
  const pathname = usePathname();
  const { can } = useSession();
  const tabs = APP_TABS.filter((t) => can(t.perm));

  return (
    <nav className="apps-bottom-nav" aria-label="Field apps">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn("apps-tab", active && "apps-tab-active")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop horizontal tabs for field apps (bottom nav is mobile-only) */
export function AppsDesktopNav() {
  const pathname = usePathname();
  const { can } = useSession();
  const tabs = APP_TABS.filter((t) => can(t.perm));

  return (
    <nav className="apps-desktop-nav" aria-label="Field apps">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn("apps-desktop-link", active && "apps-desktop-link-active")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
