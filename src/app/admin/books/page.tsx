"use client";

import { FormEvent, useEffect, useState } from "react";
import { MetricStrip, PageFrame, Panel } from "@/components/cc";
import { RequireAuth } from "@/components/RequireAuth";
import { fetchJson, loadAppData } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import {
  buildLocalPnl,
  clearQbConnection,
  loadQbConnection,
  saveQbConnection,
  type PnlReport,
  type QbConnection,
} from "@/lib/quickbooks";
import { formatCurrency } from "@/lib/utils";

type QbRemote = {
  source: "quickbooks";
  generatedAt: string;
  range: { startDate: string; endDate: string };
  totals: PnlReport["totals"];
  lines: Array<{ label: string; amount: number; group?: string }>;
  refreshToken?: string;
  error?: string;
};

export default function BooksPage() {
  return (
    <RequireAuth perm="stats">
      <BooksInner />
    </RequireAuth>
  );
}

function BooksInner() {
  const [local, setLocal] = useState<PnlReport | null>(null);
  const [qb, setQb] = useState<QbRemote | null>(null);
  const [conn, setConn] = useState<QbConnection>({
    clientId: "",
    clientSecret: "",
    realmId: "",
    refreshToken: "",
    environment: "sandbox",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadAppData().then((data) => setLocal(buildLocalPnl(data, 2)));
    const saved = loadQbConnection();
    if (saved) setConn(saved);
  }, []);

  async function onSaveConn(e: FormEvent) {
    e.preventDefault();
    saveQbConnection(conn);
    setMessage("QuickBooks credentials saved in this browser (localStorage).");
  }

  async function fetchQb() {
    if (isStaticDemo()) {
      setMessage(
        "GitHub Pages cannot call QuickBooks (no API routes). Run locally with npm run dev, or deploy a Node host.",
      );
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetchJson<QbRemote>("/api/quickbooks/pnl", {
        method: "POST",
        body: JSON.stringify(conn),
      });
      setQb(res);
      if (res.refreshToken && res.refreshToken !== conn.refreshToken) {
        const next = { ...conn, refreshToken: res.refreshToken };
        setConn(next);
        saveQbConnection(next);
      }
      setMessage("QuickBooks Profit & Loss loaded (trailing 2 years).");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "QuickBooks fetch failed");
    } finally {
      setBusy(false);
    }
  }

  const metrics = local
    ? [
        { label: "2yr revenue (local)", value: formatCurrency(local.totals.revenue) },
        { label: "2yr COGS", value: formatCurrency(local.totals.cogs) },
        { label: "2yr opex", value: formatCurrency(local.totals.opex) },
        {
          label: "2yr net",
          value: formatCurrency(local.totals.netIncome),
          signal: local.totals.netIncome < 0,
        },
      ]
    : [
        { label: "Revenue", value: "…" },
        { label: "COGS", value: "…" },
        { label: "Opex", value: "…" },
        { label: "Net", value: "…" },
      ];

  return (
    <PageFrame
      context="Finance"
      title="Books & P&L"
      subtitle="Two-year profit & loss from BHC CRM data, plus an optional QuickBooks Online hook."
    >
      <MetricStrip items={metrics} />

      <Panel title="Local CRM P&L (always available)">
        {!local ? (
          <p className="cc-empty">Building report…</p>
        ) : (
          <div className="books-pnl">
            <p className="tutorial-lead">
              Source: local store · generated{" "}
              {new Date(local.generatedAt).toLocaleString()}
            </p>
            {local.periods.map((period) => (
              <section key={period.label} className="books-period">
                <header>
                  <h3>{period.label}</h3>
                  <p>
                    Net {formatCurrency(period.netIncome)} · Gross{" "}
                    {formatCurrency(period.grossProfit)}
                  </p>
                </header>
                <dl>
                  <div>
                    <dt>Revenue</dt>
                    <dd>{formatCurrency(period.revenue)}</dd>
                  </div>
                  <div>
                    <dt>COGS</dt>
                    <dd>{formatCurrency(period.cogs)}</dd>
                  </div>
                  <div>
                    <dt>Operating expenses</dt>
                    <dd>{formatCurrency(period.opex)}</dd>
                  </div>
                  <div>
                    <dt>Net income</dt>
                    <dd>{formatCurrency(period.netIncome)}</dd>
                  </div>
                </dl>
                <ul className="books-lines">
                  {period.lines.map((line) => (
                    <li key={line.id}>
                      <span data-cat={line.category}>{line.category}</span>
                      <strong>{line.label}</strong>
                      <em>{formatCurrency(line.amount)}</em>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <ul className="tutorial-tips">
              {local.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel title="QuickBooks Online hook">
        <p className="tutorial-lead">
          Paste Intuit app credentials (sandbox or production). We refresh the OAuth
          token server-side and pull the official ProfitAndLoss report for the past two
          years. Tokens stay in this browser unless you also set QUICKBOOKS_* in .env on
          the server.
        </p>
        <form className="books-qb-form" onSubmit={onSaveConn}>
          <label>
            Environment
            <select
              className="field-input"
              value={conn.environment}
              onChange={(e) =>
                setConn((c) => ({
                  ...c,
                  environment: e.target.value as "sandbox" | "production",
                }))
              }
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </label>
          <label>
            Client ID
            <input
              className="field-input"
              value={conn.clientId}
              onChange={(e) => setConn((c) => ({ ...c, clientId: e.target.value }))}
              autoComplete="off"
            />
          </label>
          <label>
            Client secret
            <input
              className="field-input"
              type="password"
              value={conn.clientSecret}
              onChange={(e) => setConn((c) => ({ ...c, clientSecret: e.target.value }))}
              autoComplete="off"
            />
          </label>
          <label>
            Realm / company ID
            <input
              className="field-input"
              value={conn.realmId}
              onChange={(e) => setConn((c) => ({ ...c, realmId: e.target.value }))}
              autoComplete="off"
            />
          </label>
          <label className="books-span">
            Refresh token
            <input
              className="field-input"
              type="password"
              value={conn.refreshToken}
              onChange={(e) => setConn((c) => ({ ...c, refreshToken: e.target.value }))}
              autoComplete="off"
            />
          </label>
          <div className="books-qb-actions">
            <button type="submit" className="mainframe-panel-btn">
              Save credentials
            </button>
            <button
              type="button"
              className="mainframe-panel-btn"
              disabled={busy}
              onClick={fetchQb}
            >
              {busy ? "Fetching…" : "Fetch 2-year P&L"}
            </button>
            <button
              type="button"
              className="mainframe-panel-btn mainframe-panel-btn-muted"
              onClick={() => {
                clearQbConnection();
                setConn({
                  clientId: "",
                  clientSecret: "",
                  realmId: "",
                  refreshToken: "",
                  environment: "sandbox",
                });
                setQb(null);
                setMessage("Cleared QuickBooks credentials.");
              }}
            >
              Clear
            </button>
          </div>
        </form>
        {message ? <p className="knocker-msg">{message}</p> : null}
        {qb ? (
          <div className="books-period">
            <header>
              <h3>
                QuickBooks · {qb.range.startDate} → {qb.range.endDate}
              </h3>
              <p>Net {formatCurrency(qb.totals.netIncome)}</p>
            </header>
            <dl>
              <div>
                <dt>Revenue</dt>
                <dd>{formatCurrency(qb.totals.revenue)}</dd>
              </div>
              <div>
                <dt>COGS</dt>
                <dd>{formatCurrency(qb.totals.cogs)}</dd>
              </div>
              <div>
                <dt>Expenses</dt>
                <dd>{formatCurrency(qb.totals.opex)}</dd>
              </div>
              <div>
                <dt>Net</dt>
                <dd>{formatCurrency(qb.totals.netIncome)}</dd>
              </div>
            </dl>
            <ul className="books-lines">
              {qb.lines.slice(0, 30).map((line, i) => (
                <li key={`${line.label}-${i}`}>
                  <span>{line.group || "line"}</span>
                  <strong>{line.label}</strong>
                  <em>{formatCurrency(line.amount)}</em>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>
    </PageFrame>
  );
}
