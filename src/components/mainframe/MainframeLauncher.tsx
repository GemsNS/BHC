"use client";

import { useState } from "react";
import { MainframeChat } from "./MainframeChat";
import { cn } from "@/lib/utils";

export function MainframeLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={cn("mainframe-launcher", open && "mainframe-launcher-open")}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Open mainframe AI assistant"
      >
        <span className="mainframe-launcher-core" />
        <span className="mainframe-launcher-label">MAINFRAME</span>
      </button>
      {open ? (
        <div className="mainframe-drawer" role="dialog" aria-label="Mainframe AI">
          <button
            type="button"
            className="mainframe-drawer-close"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            ×
          </button>
          <MainframeChat embedded />
        </div>
      ) : null}
    </>
  );
}
