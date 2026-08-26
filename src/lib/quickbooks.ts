import type { AppData } from "./types";
import { formatCurrency } from "./utils";

export type PnlLine = {
  id: string;
  label: string;
  amount: number;
  category: "revenue" | "cogs" | "opex" | "other";
};

export type PnlPeriod = {
  label: string;
  start: string;
  end: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  netIncome: number;
  lines: PnlLine[];
};

export type PnlReport = {
  source: "local" | "quickbooks";
  generatedAt: string;
  currency: "USD";
  periods: PnlPeriod[];
  totals: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    opex: number;
    netIncome: number;
  };
  notes: string[];
};

function inRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function yearWindow(yearsBack: number): { start: Date; end: Date; label: string }[] {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const windows: { start: Date; end: Date; label: string }[] = [];
  for (let i = 0; i < yearsBack; i++) {
    const yEnd = new Date(end);
    yEnd.setFullYear(end.getFullYear() - i);
    const yStart = new Date(yEnd);
    yStart.setFullYear(yEnd.getFullYear() - 1);
    yStart.setDate(yStart.getDate() + 1);
    yStart.setHours(0, 0, 0, 0);
    windows.push({
      start: yStart,
      end: yEnd,
      label:
        i === 0
          ? `Trailing 12 months (through ${yEnd.toLocaleDateString()})`
          : `Prior 12 months (${yStart.toLocaleDateString()} – ${yEnd.toLocaleDateString()})`,
    });
  }
  return windows;
}

/** Build a 2-year P&L from local CRM store (invoices, materials, fuel, labor estimate). */
export function buildLocalPnl(data: AppData, years = 2): PnlReport {
  const periods = yearWindow(years).map((w) => {
    const lines: PnlLine[] = [];

    const paidInvoices = data.invoices.filter(
      (inv) =>
        (inv.status === "paid" || inv.status === "sent") &&
        inRange(inv.createdAt, w.start, w.end),
    );
    const invoiceRevenue = paidInvoices.reduce(
      (sum, inv) =>
        sum + inv.lines.reduce((s, line) => s + line.quantity * line.unitPrice, 0),
      0,
    );
    lines.push({
      id: "rev-invoices",
      label: `Invoices (${paidInvoices.length} paid/sent)`,
      amount: invoiceRevenue,
      category: "revenue",
    });

    const signedProposals = data.knockProposals.filter(
      (p) => p.status === "signed" && p.signedAt && inRange(p.signedAt, w.start, w.end),
    );
    const proposalRevenue = signedProposals.reduce((sum, p) => sum + p.total, 0);
    if (proposalRevenue > 0) {
      lines.push({
        id: "rev-proposals",
        label: `Signed knocker proposals (${signedProposals.length})`,
        amount: proposalRevenue,
        category: "revenue",
      });
    }

    const closedWon = data.deals.filter(
      (d) => d.stage === "closed_won" && inRange(d.updatedAt || d.createdAt, w.start, w.end),
    );
    const dealRevenue = closedWon.reduce((sum, d) => sum + d.amount, 0);
    if (dealRevenue > 0) {
      lines.push({
        id: "rev-deals",
        label: `Closed-won deals (${closedWon.length})`,
        amount: dealRevenue,
        category: "revenue",
      });
    }

    const materials = data.materials.filter((m) => inRange(m.purchasedAt, w.start, w.end));
    const materialCost = materials.reduce((sum, m) => sum + m.quantity * m.unitCost, 0);
    lines.push({
      id: "cogs-materials",
      label: `Job materials (${materials.length} POs)`,
      amount: materialCost,
      category: "cogs",
    });

    const issued = data.inventoryTxns.filter(
      (t) => t.type === "issue" && inRange(t.createdAt, w.start, w.end),
    );
    const issuedCost = issued.reduce((sum, t) => {
      const item = data.inventory.find((i) => i.id === t.itemId);
      return sum + t.quantity * (item?.unitCost ?? 0);
    }, 0);
    if (issuedCost > 0) {
      lines.push({
        id: "cogs-inventory",
        label: `Inventory issued to jobs`,
        amount: issuedCost,
        category: "cogs",
      });
    }

    const fuel = data.fuelLogs.filter((f) => inRange(f.filledAt, w.start, w.end));
    const fuelCost = fuel.reduce((sum, f) => sum + f.cost, 0);
    lines.push({
      id: "opex-fuel",
      label: `Fuel (${fuel.length} fills)`,
      amount: fuelCost,
      category: "opex",
    });

    const laborMs = data.timeEntries
      .filter((t) => t.clockOut && inRange(t.clockIn, w.start, w.end))
      .reduce((sum, t) => {
        const hours =
          (new Date(t.clockOut!).getTime() - new Date(t.clockIn).getTime()) / 3_600_000;
        const rate = data.employees.find((e) => e.id === t.employeeId)?.hourlyRate ?? 35;
        return sum + hours * rate;
      }, 0);
    lines.push({
      id: "opex-labor",
      label: "Labor (clock × hourly rate)",
      amount: Math.round(laborMs),
      category: "opex",
    });

    const revenue = lines
      .filter((l) => l.category === "revenue")
      .reduce((s, l) => s + l.amount, 0);
    const cogs = lines.filter((l) => l.category === "cogs").reduce((s, l) => s + l.amount, 0);
    const opex = lines.filter((l) => l.category === "opex").reduce((s, l) => s + l.amount, 0);
    const grossProfit = revenue - cogs;
    const netIncome = grossProfit - opex;

    return {
      label: w.label,
      start: w.start.toISOString(),
      end: w.end.toISOString(),
      revenue,
      cogs,
      grossProfit,
      opex,
      netIncome,
      lines,
    };
  });

  const totals = periods.reduce(
    (acc, p) => ({
      revenue: acc.revenue + p.revenue,
      cogs: acc.cogs + p.cogs,
      grossProfit: acc.grossProfit + p.grossProfit,
      opex: acc.opex + p.opex,
      netIncome: acc.netIncome + p.netIncome,
    }),
    { revenue: 0, cogs: 0, grossProfit: 0, opex: 0, netIncome: 0 },
  );

  return {
    source: "local",
    generatedAt: new Date().toISOString(),
    currency: "USD",
    periods,
    totals,
    notes: [
      "Local P&L aggregates BHC CRM data (not a certified accounting statement).",
      "Paid/sent invoices + signed proposals + closed-won deals count as revenue.",
      "Connect QuickBooks Online below for official books P&L.",
      `Sample totals: revenue ${formatCurrency(totals.revenue)}, net ${formatCurrency(totals.netIncome)}.`,
    ],
  };
}

export type QbConnection = {
  clientId: string;
  clientSecret: string;
  realmId: string;
  refreshToken: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  environment: "sandbox" | "production";
};

const QB_STORAGE = "bhc-qb-connection";

export function loadQbConnection(): QbConnection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(QB_STORAGE);
    if (!raw) return null;
    return JSON.parse(raw) as QbConnection;
  } catch {
    return null;
  }
}

export function saveQbConnection(conn: QbConnection): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(QB_STORAGE, JSON.stringify(conn));
}

export function clearQbConnection(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(QB_STORAGE);
}

export function envQbConfigured(): boolean {
  return Boolean(
    process.env.QUICKBOOKS_CLIENT_ID?.trim() &&
      process.env.QUICKBOOKS_CLIENT_SECRET?.trim() &&
      process.env.QUICKBOOKS_REALM_ID?.trim() &&
      process.env.QUICKBOOKS_REFRESH_TOKEN?.trim(),
  );
}
