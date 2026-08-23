"use client";

import { useEffect, useState } from "react";
import { AtlanticBridgeScene } from "@/components/site/AtlanticBridgeScene";
import { CoastalLighthouseScene } from "@/components/site/maritime/scenes/CoastalLighthouseScene";
import { FishingBoatScene } from "@/components/site/maritime/scenes/FishingBoatScene";
import { SchoonerScene } from "@/components/site/maritime/scenes/SchoonerScene";

const VARIANTS = [
  {
    caption: "Atlantic swell with a Halifax Harbour–style suspension bridge on the horizon",
    Scene: AtlanticBridgeScene,
  },
  {
    caption: "Coastal lighthouse and granite shore — Nova Scotia seascape",
    Scene: CoastalLighthouseScene,
  },
  {
    caption: "Inshore fishing boat on the Northumberland Strait swell",
    Scene: FishingBoatScene,
  },
  {
    caption: "Schooner at dusk — Bluenose country",
    Scene: SchoonerScene,
  },
] as const;

export function MaritimeFooterBanner() {
  const [index, setIndex] = useState<number | null>(null);

  useEffect(() => {
    setIndex(Math.floor(Math.random() * VARIANTS.length));
  }, []);

  if (index === null) {
    return (
      <div className="w-full" aria-busy="true">
        <span className="sr-only">Loading maritime illustration</span>
        <div
          className="h-[200px] animate-pulse rounded-lg border border-white/10 bg-base-white/[0.06] sm:h-[220px]"
          aria-hidden
        />
        {/* Reserve caption line height to avoid layout shift */}
        <p className="mt-2.5 min-h-[2.75rem] text-center text-[11px] leading-snug text-transparent" aria-hidden>
          &nbsp;
        </p>
      </div>
    );
  }

  const { Scene, caption } = VARIANTS[index];

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-lg border border-white/10 bg-base-white/[0.04] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
        <Scene className="block h-auto w-full max-h-[200px] sm:max-h-[220px]" />
      </div>
      <p className="mt-2.5 text-center text-[11px] leading-snug text-base-white/45">{caption}</p>
    </div>
  );
}
