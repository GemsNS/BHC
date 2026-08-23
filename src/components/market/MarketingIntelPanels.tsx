"use client";

import Link from "next/link";
import type { MarketingIntel } from "@/lib/market-marketing";
import { cn } from "@/lib/utils";

export function MarketingIntelPanels({ intel }: { intel: MarketingIntel }) {
  return (
    <div className="bloom-marketing-grid">
      <section className="bloom-panel bloom-equipment">
        <p className="bloom-panel-label">EQUIPMENT · RENT VS BUY</p>
        <p className="bloom-marketing-summary">{intel.assistantSummary}</p>
        <table className="bloom-table bloom-table-compact">
          <thead>
            <tr>
              <th>Asset</th>
              <th>$/day rent</th>
              <th>Buy</th>
              <th>B/E days</th>
              <th>Util.</th>
              <th>Call</th>
            </tr>
          </thead>
          <tbody>
            {intel.equipment.map((e) => (
              <tr key={e.id}>
                <td className="bloom-td-name">{e.name}</td>
                <td className="bloom-mono">${e.rentalPerDay}</td>
                <td className="bloom-mono">${(e.purchasePrice / 1000).toFixed(1)}k</td>
                <td className="bloom-mono">{e.breakEvenDays}d</td>
                <td className="bloom-mono">{e.utilizationPct}%</td>
                <td>
                  <span className={cn("bloom-verdict", `bloom-verdict-${e.verdict}`)}>
                    {e.verdict.toUpperCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bloom-panel bloom-marketplace">
        <p className="bloom-panel-label">FACEBOOK MARKETPLACE WATCH</p>
        <ul className="bloom-marketplace-list">
          {intel.marketplace.map((m) => (
            <li key={m.id} className={`bloom-marketplace-row bloom-mp-${m.tone}`}>
              <div className="bloom-mp-head">
                <span className="bloom-mp-source">FB</span>
                <span className="bloom-mp-time">{m.postedAgo}</span>
              </div>
              <p className="bloom-mp-title">{m.title}</p>
              <p className="bloom-mp-meta">
                {m.region} · {m.sellerType}
                {m.competitorMatch ? ` · vs ${m.competitorMatch}` : ""}
              </p>
              <p className="bloom-mp-price">
                {m.unit === "sqft" ? `$${m.price.toFixed(2)}/sqft` : `$${Math.round(m.price).toLocaleString()}`}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="bloom-panel bloom-ad-assistant">
        <p className="bloom-panel-label">AUTO ADVERTISEMENT ASSISTANT</p>
        <ul className="bloom-ad-list">
          {intel.adDrafts.map((ad) => (
            <li key={ad.id} className="bloom-ad-card">
              <div className="bloom-ad-head">
                <span className="bloom-ad-channel">{ad.channel}</span>
                <span className={cn("bloom-ad-status", `bloom-ad-${ad.status}`)}>
                  {ad.status}
                  {ad.scheduledFor ? ` · ${ad.scheduledFor}` : ""}
                </span>
              </div>
              <p className="bloom-ad-headline">{ad.headline}</p>
              <p className="bloom-ad-body">{ad.body}</p>
              <button type="button" className="bloom-ad-cta">
                {ad.cta} →
              </button>
            </li>
          ))}
        </ul>
        <Link href="/admin/assistant" className="bloom-signal-link">
          Open Mainframe to publish →
        </Link>
      </section>

      <section className="bloom-panel bloom-marketing-tools">
        <p className="bloom-panel-label">MARKETING TOOLS</p>
        <ul className="bloom-tools-list">
          {intel.tools.map((tool) => (
            <li key={tool.id}>
              {tool.href ? (
                <Link href={tool.href} className="bloom-tool-link">
                  <span className="bloom-tool-name">
                    {tool.name}
                    {tool.badge ? <span className="bloom-tool-badge">{tool.badge}</span> : null}
                  </span>
                  <span className="bloom-tool-desc">{tool.description}</span>
                </Link>
              ) : (
                <div className="bloom-tool-link">
                  <span className="bloom-tool-name">{tool.name}</span>
                  <span className="bloom-tool-desc">{tool.description}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
