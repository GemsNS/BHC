"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_NAV_SECTIONS, SALES_TABS } from "@/lib/nav";
import { useSession } from "@/lib/session";

type CommandEntry = {
  id: string;
  label: string;
  hint?: string;
  href: string;
  group: string;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { can } = useSession();
  const router = useRouter();

  const entries = useMemo(() => {
    const list: CommandEntry[] = [];
    for (const section of ADMIN_NAV_SECTIONS) {
      for (const item of section.items) {
        if (!can(item.perm)) continue;
        list.push({
          id: item.href,
          label: item.label,
          href: item.href,
          group: section.label,
        });
      }
    }
    if (can("leads") || can("crm")) {
      for (const tab of SALES_TABS) {
        if (!can(tab.perm)) continue;
        list.push({
          id: `sales-${tab.id}`,
          label: tab.label,
          hint: "Sales hub",
          href: `/admin/sales?tab=${tab.id}`,
          group: "Sales & clients",
        });
      }
    }
    const field: CommandEntry[] = can("apps")
      ? [
          {
            id: "apps",
            label: "Switch to field modes",
            hint: "Leave admin · open /apps",
            href: "/apps",
            group: "Mode switch",
          },
          {
            id: "schedule",
            label: "Field schedule",
            href: "/apps/schedule",
            group: "Mode switch",
          },
          {
            id: "knocker",
            label: "Field knocker",
            href: "/apps/knocker",
            group: "Mode switch",
          },
          {
            id: "clock",
            label: "Time clock",
            href: "/apps/clock",
            group: "Mode switch",
          },
        ]
      : [];
    if (can("dashboard")) {
      field.unshift({
        id: "ops-home",
        label: "Ops overview (admin)",
        href: "/admin/dashboard",
        group: "Mode switch",
      });
    }
    for (const f of field) {
      list.push(f);
    }
    return list;
  }, [can]);

  const filtered = entries.filter((e) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      e.label.toLowerCase().includes(q) ||
      e.group.toLowerCase().includes(q) ||
      e.hint?.toLowerCase().includes(q)
    );
  });

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  return (
    <div
      className="jarvis-palette-backdrop"
      role="dialog"
      aria-modal
      aria-label="Command palette"
      onClick={() => setOpen(false)}
    >
      <div
        className="jarvis-palette jarvis-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          className="jarvis-palette-input"
          placeholder="Jump to anywhere…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered[0]) go(filtered[0].href);
          }}
        />
        <ul className="jarvis-palette-list">
          {filtered.slice(0, 12).map((item) => (
            <li key={item.id}>
              <button type="button" className="jarvis-palette-item" onClick={() => go(item.href)}>
                <span>{item.label}</span>
                <span className="jarvis-palette-meta">
                  {item.hint ?? item.group}
                </span>
              </button>
            </li>
          ))}
          {!filtered.length ? (
            <li className="jarvis-palette-empty">No matches</li>
          ) : null}
        </ul>
        <p className="jarvis-palette-hint">
          <kbd>⌘</kbd>+<kbd>K</kbd> anywhere · powered by BHC Intelligence
        </p>
      </div>
    </div>
  );
}

export function CommandPaletteTrigger() {
  const [mounted, setMounted] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setMounted(true);
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        setTick((n) => n + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!mounted) return null;

  return (
    <button
      type="button"
      className="jarvis-cmd-trigger"
      onClick={() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true }),
        );
      }}
    >
      Search
      <kbd>⌘K</kbd>
    </button>
  );
}
