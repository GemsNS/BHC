"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { MarketPulse } from "@/lib/market-intel";
import { loadMarketPulse } from "@/lib/market-intel";
import { cn } from "@/lib/utils";
import { MiniSparkline } from "./MiniSparkline";
import { TickerTape } from "./TickerTape";

function formatPrice(t: MarketPulse["tickers"][0]): string {
  if (t.category === "macro") return `${t.price.toFixed(2)}%`;
  if (t.symbol === "BHC-KNOCK") return String(Math.round(t.price));
  if (t.symbol === "BHC-FUEL" || t.symbol === "BHC-PIPE") {
    return t.price >= 1000 ? `$${(t.price / 1000).toFixed(1)}k` : `$${Math.round(t.price)}`;
  }
  return t.price.toFixed(2);
}

export function MarketTerminal() {
  const [pulse, setPulse] = useState<MarketPulse | null>(null);
  const [selected, setSelected] = useState("LBR");
  const [flashKey, setFlashKey] = useState("0");
  const prevPrices = useRef<Record<string, number>>({});

  const refresh = useCallback(async () => {
    const next = await loadMarketPulse();
    setPulse(next);
    setFlashKey(String(Date.now()));
    prevPrices.current = Object.fromEntries(next.tickers.map((t) => [t.symbol, t.price]));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!pulse) {
    return <p className="bloom-loading">Syncing market terminal…</p>;
  }

  const focus = pulse.tickers.find((t) => t.symbol === selected) ?? pulse.tickers[0];
  const external = pulse.tickers.filter((t) => t.category !== "internal");
  const internal = pulse.tickers.filter((t) => t.category === "internal");

  return (
    <div className="bloom-terminal command-page-enter">
      <TickerTape tickers={pulse.tickers} flashKey={flashKey} />

      <header className="bloom-header">
        <div>
          <p className="bloom-eyebrow">BHC MARKET INTELLIGENCE</p>
          <h1 className="bloom-title">COMMAND TERMINAL</h1>
        </div>
        <div className="bloom-header-meta">
          <span className="bloom-source" data-live={pulse.source !== "synthetic"}>
            {pulse.source === "synthetic"
              ? "SYNTH PULSE"
              : pulse.source === "live"
                ? "LIVE FEED"
                : "MIXED FEED"}
          </span>
          <span className="bloom-updated">
            Updated {new Date(pulse.updatedAt).toLocaleTimeString()}
          </span>
          <button type="button" className="bloom-refresh" onClick={() => refresh()}>
            Refresh
          </button>
          <Link href="/admin/dashboard" className="bloom-link">
            ← Command deck
          </Link>
        </div>
      </header>

      <section className="bloom-watch-strip" aria-label="Market watchlist">
        <p className="bloom-panel-label bloom-watch-strip-label">WATCHLIST</p>
        <div className="bloom-watch-scroll">
          {external.map((t) => (
            <button
              key={t.symbol}
              type="button"
              className={cn(
                "bloom-watch-chip",
                selected === t.symbol && "bloom-watch-chip-active",
              )}
              onClick={() => setSelected(t.symbol)}
            >
              <span className="bloom-watch-chip-sym">{t.symbol}</span>
              <span className="bloom-watch-chip-name">{t.name}</span>
              <span
                className={cn(
                  "bloom-watch-chip-px",
                  t.changePct > 0 && "bloom-up",
                  t.changePct < 0 && "bloom-down",
                )}
              >
                {formatPrice(t)}
              </span>
            </button>
          ))}
        </div>
        <p className="bloom-panel-label bloom-internal-label">BHC INTERNAL</p>
        <div className="bloom-internal-scroll">
          {internal.map((t) => (
            <button
              key={t.symbol}
              type="button"
              className={cn(
                "bloom-internal-chip",
                selected === t.symbol && "bloom-internal-chip-active",
              )}
              onClick={() => setSelected(t.symbol)}
            >
              <span>{t.symbol}</span>
              <span className="bloom-internal-chip-px">{formatPrice(t)}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="bloom-grid">
        <section className="bloom-panel bloom-main">
          {focus ? (
            <>
              <div className="bloom-focus-head">
                <div>
                  <p className="bloom-focus-sym">{focus.symbol}</p>
                  <p className="bloom-focus-name">{focus.name}</p>
                </div>
                <div className="bloom-focus-quote">
                  <p
                    className={cn(
                      "bloom-focus-px",
                      focus.changePct > 0 && "bloom-up",
                      focus.changePct < 0 && "bloom-down",
                    )}
                  >
                    {formatPrice(focus)}
                  </p>
                  <p className="bloom-focus-chg">
                    {focus.change >= 0 ? "+" : ""}
                    {focus.change.toFixed(2)} ({focus.changePct >= 0 ? "+" : ""}
                    {focus.changePct.toFixed(2)}%)
                  </p>
                </div>
              </div>
              <div className="bloom-chart">
                <MiniSparkline
                  values={focus.history}
                  positive={focus.changePct >= 0}
                  width={480}
                  height={120}
                />
              </div>
            </>
          ) : null}

          {pulse.weather ? (
            <div className="bloom-weather">
              <p className="bloom-panel-label">FIELD WEATHER · {pulse.weather.location}</p>
              <div className="bloom-weather-grid">
                <div>
                  <p className="bloom-weather-val">{pulse.weather.tempF}°F</p>
                  <p className="bloom-weather-sub">{pulse.weather.condition}</p>
                </div>
                <div>
                  <p className="bloom-weather-stat">
                    Wind <strong>{pulse.weather.windMph} mph</strong>
                  </p>
                  <p className="bloom-weather-stat">
                    Precip <strong>{pulse.weather.precipMm} mm</strong>
                  </p>
                </div>
                <p className="bloom-weather-note">{pulse.weather.fieldNote}</p>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="bloom-panel bloom-signals">
          <p className="bloom-panel-label">DECISION SIGNALS</p>
          <ul className="bloom-signal-list">
            {pulse.signals.map((s) => (
              <li key={s.id} className={`bloom-signal bloom-priority-${s.priority}`}>
                <p className="bloom-signal-label">{s.label}</p>
                <p className="bloom-signal-detail">{s.detail}</p>
                {s.href ? (
                  <Link href={s.href} className="bloom-signal-link">
                    Act →
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <div className="bloom-lower">
        <section className="bloom-panel bloom-competitors">
          <p className="bloom-panel-label">COMPETITOR PRICING · $/SQFT ROOFING</p>
          <table className="bloom-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Region</th>
                <th>$/sqft</th>
                <th>Δ</th>
                <th>Rating</th>
                <th>Active est.</th>
                <th>Intel</th>
              </tr>
            </thead>
            <tbody>
              {pulse.competitors.map((c) => (
                <tr key={c.id} className="bloom-row-animate">
                  <td className="bloom-td-name">{c.name}</td>
                  <td>{c.region}</td>
                  <td className="bloom-mono">${c.pricePerSqFt.toFixed(2)}</td>
                  <td
                    className={cn(
                      "bloom-mono",
                      c.changePct > 0 && "bloom-up",
                      c.changePct < 0 && "bloom-down",
                    )}
                  >
                    {c.changePct >= 0 ? "+" : ""}
                    {c.changePct.toFixed(2)}%
                  </td>
                  <td>{c.rating.toFixed(1)} ★</td>
                  <td className="bloom-mono">{c.estJobsActive}</td>
                  <td className="bloom-td-note">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bloom-panel bloom-headlines">
          <p className="bloom-panel-label">HEADLINE TAPE</p>
          <ul className="bloom-headline-list">
            {pulse.headlines.map((h) => (
              <li key={h.id} className={`bloom-headline bloom-headline-${h.tone}`}>
                <span className="bloom-headline-time">{h.time}</span>
                <span className="bloom-headline-tag">{h.tag}</span>
                <span className="bloom-headline-text">{h.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
