/**
 * QuickBooks ops queue + connection helpers for Mainframe / Books.
 * Credentials live in localStorage (browser) or QUICKBOOKS_* env (server).
 * Actual Intuit API calls go through /api/quickbooks/* on a Node host.
 */

import { envQbConfigured, loadQbConnection } from "./quickbooks";
import { isStaticDemo } from "./paths";

export type QbOpName =
  | "qb_get_pnl"
  | "qb_sync_customer"
  | "qb_sync_invoice"
  | "qb_sync_payroll_hours";

export type QbQueuedOp = {
  id: string;
  tool: QbOpName;
  args: Record<string, unknown>;
  createdAt: string;
  status: "queued" | "sent" | "failed" | "simulated";
  detail: string;
};

const QB_QUEUE_KEY = "bhc-qb-ops-queue";
const QB_LINKS_KEY = "bhc-qb-entity-links";

export type QbEntityLinks = {
  customers: Record<string, string>;
  invoices: Record<string, string>;
  employees: Record<string, string>;
};

function canUseBrowserStorage(): boolean {
  return typeof window !== "undefined";
}

export function qbConnectionSummary(): string {
  if (canUseBrowserStorage()) {
    const c = loadQbConnection();
    if (c?.realmId && c.refreshToken) {
      return `connected (realm ${c.realmId}, ${c.environment})`;
    }
  }
  if (envQbConfigured()) return "connected via server env (QUICKBOOKS_*)";
  if (isStaticDemo()) {
    return "not connected — paste credentials on Books (Pages needs Node host for live QB API)";
  }
  return "not connected — open Books & P&L and save QuickBooks credentials";
}

export function loadQbLinks(): QbEntityLinks {
  if (!canUseBrowserStorage()) {
    return { customers: {}, invoices: {}, employees: {} };
  }
  try {
    const raw = localStorage.getItem(QB_LINKS_KEY);
    if (!raw) return { customers: {}, invoices: {}, employees: {} };
    return { customers: {}, invoices: {}, employees: {}, ...JSON.parse(raw) };
  } catch {
    return { customers: {}, invoices: {}, employees: {} };
  }
}

export function saveQbLinks(links: QbEntityLinks): void {
  if (!canUseBrowserStorage()) return;
  localStorage.setItem(QB_LINKS_KEY, JSON.stringify(links));
}

export function loadQbQueue(): QbQueuedOp[] {
  if (!canUseBrowserStorage()) return [];
  try {
    const raw = localStorage.getItem(QB_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QbQueuedOp[]) : [];
  } catch {
    return [];
  }
}

function saveQbQueue(ops: QbQueuedOp[]): void {
  if (!canUseBrowserStorage()) return;
  localStorage.setItem(QB_QUEUE_KEY, JSON.stringify(ops.slice(0, 100)));
}

export function queueQbOp(
  tool: string,
  args: Record<string, unknown>,
): { ok: boolean; summary: string; data?: Record<string, unknown> } {
  const name = tool as QbOpName;
  const id = `qbop-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const createdAt = new Date().toISOString();

  if (name === "qb_get_pnl") {
    return {
      ok: true,
      summary:
        "Queued QuickBooks P&L pull. Open Books & P&L → Fetch QuickBooks P&L, or run flush from Mainframe after connect.",
      data: { action: "pnl", id },
    };
  }

  const detail =
    name === "qb_sync_customer"
      ? `Sync CRM customer/lead → QB Customer (${String(args.lead ?? args.customer ?? args.name ?? "unknown")})`
      : name === "qb_sync_invoice"
        ? `Sync CRM invoice → QB Invoice (${String(args.invoice ?? args.invoiceId ?? "unknown")})`
        : `Sync payroll hours / TimeActivity (${String(args.employeeId ?? args.employee ?? "all open entries")})`;

  const op: QbQueuedOp = {
    id,
    tool: name,
    args,
    createdAt,
    status: isStaticDemo() ? "simulated" : "queued",
    detail,
  };

  if (canUseBrowserStorage()) {
    const q = loadQbQueue();
    q.unshift(op);
    saveQbQueue(q);
  }

  const conn = qbConnectionSummary();
  if (op.status === "simulated") {
    return {
      ok: true,
      summary: `SIMULATED QuickBooks op (static demo): ${detail}. ${conn}. Deploy Node host to execute for real.`,
      data: { opId: id, simulated: true },
    };
  }

  return {
    ok: true,
    summary: `Queued QuickBooks op: ${detail}. Connection: ${conn}. Call qb_status or open Books to flush.`,
    data: { opId: id, queued: true },
  };
}

/** Execute queued QB ops against /api/quickbooks/action when Node API is available. */
export async function flushQbQueue(fetchJson: <T>(url: string, init?: RequestInit) => Promise<T>): Promise<string[]> {
  if (isStaticDemo() || !canUseBrowserStorage()) {
    return ["QuickBooks flush skipped (static demo or no browser)."];
  }
  const conn = loadQbConnection();
  if (!conn?.refreshToken) {
    return ["No QuickBooks credentials in browser — save them on Books & P&L first."];
  }

  const queue = loadQbQueue();
  const pending = queue.filter((o) => o.status === "queued");
  if (!pending.length) return ["No queued QuickBooks ops."];

  const notes: string[] = [];
  for (const op of pending) {
    try {
      const res = await fetchJson<{ ok: boolean; summary?: string; error?: string; qbId?: string }>(
        "/api/quickbooks/action",
        {
          method: "POST",
          body: JSON.stringify({
            action: op.tool,
            args: op.args,
            connection: conn,
          }),
        },
      );
      op.status = res.ok ? "sent" : "failed";
      op.detail = res.summary || res.error || op.detail;
      if (res.qbId && op.tool === "qb_sync_customer") {
        const links = loadQbLinks();
        const key = String(op.args.leadId ?? op.args.lead ?? "");
        if (key) {
          links.customers[key] = res.qbId;
          saveQbLinks(links);
        }
      }
      if (res.qbId && op.tool === "qb_sync_invoice") {
        const links = loadQbLinks();
        const key = String(op.args.invoiceId ?? op.args.invoice ?? "");
        if (key) {
          links.invoices[key] = res.qbId;
          saveQbLinks(links);
        }
      }
      notes.push(`${op.status.toUpperCase()}: ${op.detail}`);
    } catch (err) {
      op.status = "failed";
      op.detail = err instanceof Error ? err.message : "QB flush failed";
      notes.push(`FAILED: ${op.detail}`);
    }
  }
  saveQbQueue(queue);
  return notes;
}
