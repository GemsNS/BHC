"use client";

import Link from "next/link";
import type { DeckView } from "@/lib/command-deck";
import { cn } from "@/lib/utils";

const TABS: Array<{ id: DeckView; label: string }> = [
  { id: "sales", label: "SALES" },
  { id: "install", label: "INSTALL" },
  { id: "admin", label: "ADMIN" },
  { id: "network", label: "NET" },
];

export function RadialHud({
  active,
  onChange,
}: {
  active: DeckView;
  onChange: (view: DeckView) => void;
}) {
  return (
    <div className="hud-dock" aria-label="Command deck navigation">
      <svg className="hud-dock-rings" viewBox="0 0 400 120" aria-hidden>
        <ellipse cx="200" cy="110" rx="180" ry="40" className="hud-ring-outer" />
        <ellipse cx="200" cy="108" rx="120" ry="28" className="hud-ring-mid" />
        <line x1="200" y1="20" x2="200" y2="95" className="hud-crosshair" />
        <line x1="140" y1="70" x2="260" y2="70" className="hud-crosshair" />
      </svg>
      <button type="button" className="hud-core-orb" aria-label="BHC core">
        <span className="hud-core-particles" />
      </button>
      <nav className="hud-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cn("hud-tab", active === tab.id && "hud-tab-active")}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <Link href="/admin/sales" className="hud-dock-link">
        Open modules →
      </Link>
    </div>
  );
}
