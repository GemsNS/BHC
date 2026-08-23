"use client";

import type { MarketTicker } from "@/lib/market-intel";
import { cn } from "@/lib/utils";

function formatTickerPrice(t: MarketTicker): string {
  if (t.category === "macro") return `${t.price.toFixed(2)}%`;
  if (t.symbol === "BHC-KNOCK") return String(Math.round(t.price));
  return t.price.toFixed(2);
}

function TickerSegment({ tickers, ariaHidden }: { tickers: MarketTicker[]; ariaHidden?: boolean }) {
  return (
    <div className="bloom-ticker-segment" aria-hidden={ariaHidden}>
      {tickers.map((t) => (
        <span
          key={t.symbol}
          className={cn(
            "bloom-ticker-item",
            t.changePct > 0 && "bloom-up",
            t.changePct < 0 && "bloom-down",
          )}
        >
          <span className="bloom-ticker-sym">{t.symbol}</span>
          <span className="bloom-ticker-px">{formatTickerPrice(t)}</span>
          <span className="bloom-ticker-chg">
            {t.changePct >= 0 ? "+" : ""}
            {t.changePct.toFixed(2)}%
          </span>
        </span>
      ))}
    </div>
  );
}

export function TickerTape({ tickers }: { tickers: MarketTicker[] }) {
  return (
    <div className="bloom-ticker-wrap" aria-label="Market ticker">
      <div className="bloom-ticker-marquee">
        <div className="bloom-ticker-track">
          <TickerSegment tickers={tickers} />
          <TickerSegment tickers={tickers} ariaHidden />
        </div>
      </div>
    </div>
  );
}
