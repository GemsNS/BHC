"use client";

import { FormEvent, useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useSearchParams } from "next/navigation";
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

type QbStatus = {
  oauthConfigured: boolean;
  connected: boolean;
  realmId: string | null;
  environment: "sandbox" | "production";
  environmentLabel?: string;
  connectedAt: string | null;
  redirectUri: string;
};

export default function BooksPage() {
  return (
    <RequireAuth perm="stats">
      <BooksInner />
    </RequireAuth>
  );
}

function BooksInner() {
  const searchParams = useSearchParams();
  const staticDemo = isStaticDemo();

  const [local, setLocal] = useState<PnlReport | null>(null);
  const [qb, setQb] = useState<QbRemote | null>(null);
  const [status, setStatus] = useState<QbStatus | null>(null);
  const [conn, setConn] = useState<QbConnection>({
    clientId: "",
    clientSecret: "",
    realmId: "",
    refreshToken: "",
    environment: "sandbox",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    if (staticDemo) return;
    try {
      const res = await fetchJson<QbStatus>("/api/quickbooks/status");
      setStatus(res);
    } catch {
      setStatus(null);
    }
  }, [staticDemo]);

  useEffect(() => {
    loadAppData().then((data) => setLocal(buildLocalPnl(data, 2)));
    if (staticDemo) {
      const saved = loadQbConnection();
      if (saved) setConn(saved);
      return;
    }
    void refreshStatus();
  }, [refreshStatus, staticDemo]);

  useEffect(() => {
    const qbParam = searchParams.get("qb");
    if (!qbParam) return;
    if (qbParam === "connected") {
      setMessage("QuickBooks connected successfully.");
      void refreshStatus();
    } else if (qbParam === "disconnected") {
      setMessage("QuickBooks disconnected.");
      setQb(null);
      void refreshStatus();
    } else if (qbParam === "error") {
      const reason = searchParams.get("reason") || "unknown";
      setMessage(`QuickBooks connection failed: ${reason}`);
    }
  }, [searchParams, refreshStatus]);

  async function onSaveConn(e: FormEvent) {
    e.preventDefault();
    saveQbConnection(conn);
    setMessage("QuickBooks credentials saved in this browser (localStorage).");
  }

  async function connectQb() {
    if (staticDemo) {
      setMessage(
        "GitHub Pages cannot run OAuth (no API routes). Deploy to bhcontracting.ca or run npm run dev.",
      );
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetchJson<{ authorizeUrl: string }>("/api/quickbooks/connect", {
        method: "POST",
        body: JSON.stringify({}),
      });
      window.location.href = res.authorizeUrl;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Connect failed");
      setBusy(false);
    }
  }

  async function disconnectQb() {
    setBusy(true);
    setMessage(null);
    try {
      await fetchJson("/api/quickbooks/disconnect", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setQb(null);
      setMessage("QuickBooks disconnected.");
      await refreshStatus();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }

  async function fetchQb() {
    if (staticDemo) {
      setMessage(
        "GitHub Pages cannot call QuickBooks (no API routes). Run locally with npm run dev, or deploy a Node host.",
      );
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const body = staticDemo ? conn : {};
      const res = await fetchJson<QbRemote>("/api/quickbooks/pnl", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setQb(res);
      if (staticDemo && res.refreshToken && res.refreshToken !== conn.refreshToken) {
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

  const oauthReady = status?.oauthConfigured ?? false;
  const qbConnected = status?.connected ?? false;
  const envLabel =
    status?.environmentLabel ??
    (status?.environment === "production" ? "Production (live books)" : "Sandbox");

  return (
    <PageFrame
      context="Finance"
      title="Books & P&L"
      subtitle="Two-year profit & loss from BHC CRM data, plus live QuickBooks Online books."
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

      <Panel title="QuickBooks Online">
        {staticDemo ? (
          <>
            <p className="tutorial-lead">
              Static demo only — paste Intuit sandbox credentials in localStorage. On
              production (bhcontracting.ca), OAuth stores tokens server-side.
            </p>
            <LegacyQbForm
              conn={conn}
              setConn={setConn}
              busy={busy}
              onSaveConn={onSaveConn}
              fetchQb={fetchQb}
              onClear={() => {
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
            />
          </>
        ) : (
          <>
            <p className="tutorial-lead">
              Connect your live QuickBooks company via secure OAuth. Credentials and tokens
              stay on the server — never in the browser.
            </p>
            <dl className="books-qb-status">
              <div>
                <dt>Intuit environment</dt>
                <dd>{envLabel}</dd>
              </div>
              <div>
                <dt>OAuth</dt>
                <dd>{oauthReady ? "Ready" : "Server credentials not configured"}</dd>
              </div>
              <div>
                <dt>Connection</dt>
                <dd>
                  {qbConnected
                    ? `Connected · company ${status?.realmId}`
                    : "Not connected — click Connect QuickBooks below"}
                </dd>
              </div>
              {status?.connectedAt ? (
                <div>
                  <dt>Connected at</dt>
                  <dd>{new Date(status.connectedAt).toLocaleString()}</dd>
                </div>
              ) : null}
            </dl>
            <div className="books-qb-actions">
              <button
                type="button"
                className="mainframe-panel-btn"
                disabled={busy || !oauthReady || qbConnected}
                onClick={connectQb}
              >
                {busy ? "Working…" : "Connect QuickBooks"}
              </button>
              <button
                type="button"
                className="mainframe-panel-btn"
                disabled={busy || !qbConnected}
                onClick={fetchQb}
              >
                {busy ? "Fetching…" : "Fetch 2-year P&L"}
              </button>
              <button
                type="button"
                className="mainframe-panel-btn mainframe-panel-btn-muted"
                disabled={busy || !qbConnected}
                onClick={disconnectQb}
              >
                Disconnect
              </button>
            </div>
          </>
        )}
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

function LegacyQbForm({
  conn,
  setConn,
  busy,
  onSaveConn,
  fetchQb,
  onClear,
}: {
  conn: QbConnection;
  setConn: Dispatch<SetStateAction<QbConnection>>;
  busy: boolean;
  onSaveConn: (e: FormEvent) => void;
  fetchQb: () => void;
  onClear: () => void;
}) {
  return (
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
        <button type="button" className="mainframe-panel-btn" disabled={busy} onClick={fetchQb}>
          {busy ? "Fetching…" : "Fetch 2-year P&L"}
        </button>
        <button
          type="button"
          className="mainframe-panel-btn mainframe-panel-btn-muted"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
    </form>
  );
}
