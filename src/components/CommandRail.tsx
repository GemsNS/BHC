"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import {
  ADMIN_NAV_SECTIONS,
  isNavItemActive,
  sectionForPath,
  type NavItem,
  type NavSection,
} from "@/lib/nav";
import type { Permission } from "@/lib/types";
import { cn } from "@/lib/utils";

const APP_TABS: Array<{
  href: string;
  label: string;
  perm: Permission;
  exact?: boolean;
  short: string;
}> = [
  { href: "/apps", label: "Home", perm: "apps", exact: true, short: "Hm" },
  { href: "/apps/schedule", label: "Schedule", perm: "schedule", short: "Sc" },
  { href: "/apps/board", label: "Board", perm: "board", short: "Bd" },
  { href: "/apps/progress", label: "Progress", perm: "progress", short: "Pr" },
  { href: "/apps/tools", label: "Tools", perm: "tools", short: "Tl" },
  { href: "/apps/knocker", label: "Knock", perm: "knocker", short: "Kn" },
  { href: "/apps/clock", label: "Clock", perm: "clock", short: "Cl" },
];

export const APP_FIELD_TABS = APP_TABS;

const RAIL_COLLAPSED_KEY = "bhc-rail-collapsed";
const RAIL_SECTIONS_KEY = "bhc-rail-sections-open";

function canSeeSales(can: (p: Permission) => boolean) {
  return (
    can("leads") ||
    can("crm") ||
    can("workflows") ||
    can("tickets") ||
    can("outreach")
  );
}

function navIcon(item: NavItem): string {
  return item.short ?? item.label.slice(0, 2);
}

function readSectionOpen(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(RAIL_SECTIONS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function RailLink({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const active = isNavItemActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      className={cn("cc-rail-link", active && "cc-rail-link-active")}
      title={collapsed ? item.label : undefined}
    >
      <span className="cc-rail-icon" aria-hidden>
        {navIcon(item)}
      </span>
      <span className="cc-rail-link-label">{item.label}</span>
    </Link>
  );
}

function AdminNav({
  pathname,
  collapsed,
  sectionOpen,
  onToggleSection,
}: {
  pathname: string;
  collapsed: boolean;
  sectionOpen: Record<string, boolean>;
  onToggleSection: (id: string) => void;
}) {
  const { can } = useSession();

  const sections = useMemo(
    () =>
      ADMIN_NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (item.href === "/admin/sales") return canSeeSales(can);
          return can(item.perm);
        }),
      })).filter((section) => section.items.length > 0),
    [can],
  );

  if (collapsed) {
    const flat = sections.flatMap((s) => s.items);
    return (
      <nav className="cc-rail-nav cc-rail-nav-grouped" aria-label="Ops sections">
        {flat.map((item) => (
          <RailLink key={item.href} item={item} pathname={pathname} collapsed />
        ))}
      </nav>
    );
  }

  return (
    <nav className="cc-rail-nav cc-rail-nav-grouped" aria-label="Ops sections">
      {sections.map((section) => (
        <NavSectionBlock
          key={section.id}
          section={section}
          pathname={pathname}
          open={sectionOpen[section.id] ?? false}
          onToggle={() => onToggleSection(section.id)}
        />
      ))}
    </nav>
  );
}

function NavSectionBlock({
  section,
  pathname,
  open,
  onToggle,
}: {
  section: NavSection & { items: NavItem[] };
  pathname: string;
  open: boolean;
  onToggle: () => void;
}) {
  const sectionActive = section.items.some((item) =>
    isNavItemActive(pathname, item.href),
  );
  const panelId = `cc-nav-section-${section.id}`;

  return (
    <div
      className={cn("cc-nav-section", sectionActive && "cc-nav-section-active")}
    >
      <button
        type="button"
        className="cc-nav-section-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="cc-nav-section-label">{section.label}</span>
        <span className={cn("cc-nav-chevron", open && "cc-nav-chevron-open")} aria-hidden />
      </button>
      <div
        id={panelId}
        className={cn("cc-nav-section-items", open && "cc-nav-section-items-open")}
      >
        {section.items.map((item) => (
          <RailLink key={item.href} item={item} pathname={pathname} collapsed={false} />
        ))}
      </div>
    </div>
  );
}

export function CommandRail({
  mode,
  collapsed,
  onToggleCollapsed,
}: {
  mode: "admin" | "apps";
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { can, logout, user } = useSession();
  const appItems = APP_TABS.filter((t) => can(t.perm));

  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>(() => {
    const stored = readSectionOpen();
    const active = sectionForPath(pathname);
    return {
      ...stored,
      overview: stored.overview ?? true,
      ...(active ? { [active.id]: true } : {}),
    };
  });

  const syncSectionsForPath = useCallback((path: string, stored?: Record<string, boolean>) => {
    const active = sectionForPath(path);
    const base = stored ?? readSectionOpen();
    const next: Record<string, boolean> = { ...base };
    if (active) next[active.id] = true;
    next.overview = true;
    setSectionOpen(next);
  }, []);

  useEffect(() => {
    syncSectionsForPath(pathname);
  }, [pathname, syncSectionsForPath]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(RAIL_SECTIONS_KEY, JSON.stringify(sectionOpen));
  }, [sectionOpen]);

  function toggleSection(id: string) {
    setSectionOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function signOut() {
    logout();
    router.replace("/login");
  }

  return (
    <aside className={cn("cc-rail", collapsed && "cc-rail-collapsed")}>
      <div className="cc-rail-brand">
        <div className="cc-rail-brand-row">
          <p className="cc-rail-logo">BHC</p>
          <button
            type="button"
            className="cc-rail-collapse-btn"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand menu" : "Collapse menu"}
          >
            <span className={cn("cc-rail-collapse-icon", collapsed && "cc-rail-collapse-icon-flip")} />
          </button>
        </div>
        {!collapsed ? (
          <>
            <p className="cc-rail-tag">Intelligence layer</p>
            {user ? (
              <p className="cc-rail-user">
                {user.name}
                <span>{user.role}</span>
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      {mode === "admin" ? (
        <AdminNav
          pathname={pathname}
          collapsed={collapsed}
          sectionOpen={sectionOpen}
          onToggleSection={toggleSection}
        />
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
                title={collapsed ? tab.label : undefined}
              >
                <span className="cc-rail-icon" aria-hidden>
                  {tab.short}
                </span>
                <span className="cc-rail-link-label">{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <div className="cc-rail-foot">
        {mode === "admin" && can("apps") ? (
          <Link
            href="/apps"
            className="cc-rail-cta"
            title={collapsed ? "Field modes" : undefined}
          >
            {collapsed ? "Fld" : "Field modes"}
          </Link>
        ) : null}
        {mode === "apps" && can("dashboard") ? (
          <Link
            href="/admin/dashboard"
            className="cc-rail-cta"
            title={collapsed ? "Overview" : undefined}
          >
            {collapsed ? "Ops" : "Overview"}
          </Link>
        ) : null}
        <button
          type="button"
          className="cc-rail-logout"
          onClick={signOut}
          title={collapsed ? "Sign out" : undefined}
        >
          {collapsed ? "Out" : "Sign out"}
        </button>
      </div>
    </aside>
  );
}

export function useRailCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(RAIL_COLLAPSED_KEY) === "1");
    } catch {
      setCollapsed(false);
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(RAIL_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return [collapsed, toggle];
}
