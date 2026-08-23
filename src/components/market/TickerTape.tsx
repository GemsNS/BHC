"use client";

import type { MarketTicker } from "@/lib/market-intel";
import { cn } from "@/lib/utils";

export function TickerTape({
  tickers,
  flashKey,
}: {
  tickers: MarketTicker[];
  flashKey?: string;
}) {
  const tape = [...tickers, ...tickers];
  return (
    <div className="bloom-ticker-wrap" aria-label="Market ticker">
      <div className="bloom-ticker-track" key={flashKey}>
        {tape.map((t, i) => (
          <span
            key={`${t.symbol}-${i}`}
            className={cn(
              "bloom-ticker-item",
              t.changePct > 0 && "bloom-up",
              t.changePct < 0 && "bloom-down",
            )}
          >
            <span className="bloom-ticker-sym">{t.symbol}</span>
            <span className="bloom-ticker-px">
              {t.category === "macro"
                ? `${t.price.toFixed(2)}%`
                : t.symbol === "BHC-KNOCK"
                  ? Math.round(t.price)
                  : t.price.toFixed(2)}
            </span>
            <span className="bloom-ticker-chg">
              {t.changePct >= 0 ? "+" : ""}
              {t.changePct.toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
