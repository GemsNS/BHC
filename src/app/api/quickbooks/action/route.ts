/**
 * Unified QuickBooks Online actions for Mainframe + Books.
 * POST { action, args, connection? } — uses body connection or QUICKBOOKS_* env.
 */

import { NextRequest, NextResponse } from "next/server";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

type QbConnectionBody = {
  clientId?: string;
  clientSecret?: string;
  realmId?: string;
  refreshToken?: string;
  environment?: "sandbox" | "production";
};

function qbBase(env: "sandbox" | "production") {
  return env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

async function refreshAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  const basic = Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64");
  const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QuickBooks token refresh failed (${res.status}): ${text.slice(0, 240)}`);
  }
  return res.json() as Promise<TokenResponse>;
}

function resolveConn(body: QbConnectionBody) {
  const clientId = body.clientId?.trim() || process.env.QUICKBOOKS_CLIENT_ID?.trim();
  const clientSecret =
    body.clientSecret?.trim() || process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
  const realmId = body.realmId?.trim() || process.env.QUICKBOOKS_REALM_ID?.trim();
  const refreshToken =
    body.refreshToken?.trim() || process.env.QUICKBOOKS_REFRESH_TOKEN?.trim();
  const environment =
    body.environment ||
    (process.env.QUICKBOOKS_ENV?.trim() as "sandbox" | "production" | undefined) ||
    "sandbox";
  return { clientId, clientSecret, realmId, refreshToken, environment };
}

async function qbFetch(
  path: string,
  conn: {
    clientId: string;
    clientSecret: string;
    realmId: string;
    refreshToken: string;
    environment: "sandbox" | "production";
  },
  init?: RequestInit,
) {
  const tokens = await refreshAccessToken(conn);
  const url = `${qbBase(conn.environment)}/v3/company/${conn.realmId}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json, tokens };
}

export async function GET() {
  const configured = Boolean(
    process.env.QUICKBOOKS_CLIENT_ID?.trim() &&
      process.env.QUICKBOOKS_CLIENT_SECRET?.trim() &&
      process.env.QUICKBOOKS_REALM_ID?.trim() &&
      process.env.QUICKBOOKS_REFRESH_TOKEN?.trim(),
  );
  return NextResponse.json({
    ok: true,
    envConfigured: configured,
    actions: [
      "status",
      "qb_get_pnl",
      "qb_sync_customer",
      "qb_sync_invoice",
      "qb_sync_payroll_hours",
    ],
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      args?: Record<string, unknown>;
      connection?: QbConnectionBody;
    };
    const action = String(body.action ?? "status");
    const args = body.args ?? {};
    const resolved = resolveConn(body.connection ?? {});

    if (action === "status") {
      return NextResponse.json({
        ok: true,
        summary: resolved.refreshToken
          ? `QuickBooks credentials present (realm ${resolved.realmId || "env"}, ${resolved.environment})`
          : "QuickBooks credentials missing",
        configured: Boolean(
          resolved.clientId &&
            resolved.clientSecret &&
            resolved.realmId &&
            resolved.refreshToken,
        ),
      });
    }

    if (
      !resolved.clientId ||
      !resolved.clientSecret ||
      !resolved.realmId ||
      !resolved.refreshToken
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing QuickBooks credentials. Save them on Books & P&L or set QUICKBOOKS_* env.",
        },
        { status: 400 },
      );
    }

    const conn = {
      clientId: resolved.clientId,
      clientSecret: resolved.clientSecret,
      realmId: resolved.realmId,
      refreshToken: resolved.refreshToken,
      environment: resolved.environment as "sandbox" | "production",
    };

    if (action === "qb_get_pnl") {
      const end = new Date();
      const start = new Date();
      start.setFullYear(end.getFullYear() - 2);
      const path = `/reports/ProfitAndLoss?start_date=${start.toISOString().slice(0, 10)}&end_date=${end.toISOString().slice(0, 10)}&summarize_column_by=Year`;
      const { ok, status, json } = await qbFetch(path, conn);
      if (!ok) {
        return NextResponse.json(
          { ok: false, error: `P&L failed (${status})`, detail: json },
          { status: 502 },
        );
      }
      return NextResponse.json({
        ok: true,
        summary: "Fetched QuickBooks ProfitAndLoss report (2 years).",
        report: json,
      });
    }

    if (action === "qb_sync_customer") {
      const displayName = String(
        args.name ?? args.customerName ?? args.lead ?? "BHC Customer",
      ).slice(0, 100);
      const payload = {
        DisplayName: displayName,
        PrimaryEmailAddr: args.email ? { Address: String(args.email) } : undefined,
        PrimaryPhone: args.phone ? { FreeFormNumber: String(args.phone) } : undefined,
        BillAddr: args.address
          ? { Line1: String(args.address), City: String(args.city ?? "") }
          : undefined,
        Notes: String(args.notes ?? "Synced from BHC Mainframe CRM"),
      };
      const { ok, status, json } = await qbFetch("/customer", conn, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!ok) {
        return NextResponse.json(
          { ok: false, error: `Customer sync failed (${status})`, detail: json },
          { status: 502 },
        );
      }
      const qbId =
        (json as { Customer?: { Id?: string } })?.Customer?.Id ??
        (json as { QueryResponse?: { Customer?: Array<{ Id?: string }> } })?.QueryResponse
          ?.Customer?.[0]?.Id;
      return NextResponse.json({
        ok: true,
        summary: `Synced customer "${displayName}" to QuickBooks${qbId ? ` (Id ${qbId})` : ""}.`,
        qbId,
        detail: json,
      });
    }

    if (action === "qb_sync_invoice") {
      const customerRef = String(args.qbCustomerId ?? args.CustomerRef ?? "");
      const amount = Number(args.amount ?? args.total ?? 0);
      const docNumber = String(args.invoiceId ?? args.invoice ?? `BHC-${Date.now()}`).slice(
        0,
        21,
      );
      if (!customerRef) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "qbCustomerId required — sync the customer first (qb_sync_customer) and pass the QuickBooks Customer Id.",
          },
          { status: 400 },
        );
      }
      const payload = {
        DocNumber: docNumber,
        CustomerRef: { value: customerRef },
        Line: [
          {
            Amount: amount || 1,
            DetailType: "SalesItemLineDetail",
            Description: String(args.description ?? "BHC contracting services"),
            SalesItemLineDetail: {
              Qty: 1,
              UnitPrice: amount || 1,
            },
          },
        ],
        PrivateNote: "Pushed from BHC Mainframe",
      };
      const { ok, status, json } = await qbFetch("/invoice", conn, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!ok) {
        return NextResponse.json(
          { ok: false, error: `Invoice sync failed (${status})`, detail: json },
          { status: 502 },
        );
      }
      const qbId = (json as { Invoice?: { Id?: string } })?.Invoice?.Id;
      return NextResponse.json({
        ok: true,
        summary: `Synced invoice ${docNumber} to QuickBooks${qbId ? ` (Id ${qbId})` : ""}.`,
        qbId,
        detail: json,
      });
    }

    if (action === "qb_sync_payroll_hours") {
      // TimeActivity create — Intuit payroll-adjacent time tracking
      const employeeRef = String(args.qbEmployeeId ?? args.employeeRef ?? "");
      const hours = Number(args.hours ?? 0);
      const date = String(args.date ?? new Date().toISOString().slice(0, 10));
      if (!employeeRef) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "qbEmployeeId required. Map CRM employees to QuickBooks Employee Ids (Books / payroll setup).",
          },
          { status: 400 },
        );
      }
      const wholeHours = Math.floor(hours);
      const minutes = Math.round((hours - wholeHours) * 60);
      const payload = {
        NameOf: "Employee",
        EmployeeRef: { value: employeeRef },
        TxnDate: date,
        Hours: wholeHours,
        Minutes: minutes,
        Description: String(args.notes ?? "BHC field hours from Mainframe"),
      };
      const { ok, status, json } = await qbFetch("/timeactivity", conn, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!ok) {
        return NextResponse.json(
          {
            ok: false,
            error: `TimeActivity sync failed (${status})`,
            detail: json,
          },
          { status: 502 },
        );
      }
      const qbId = (json as { TimeActivity?: { Id?: string } })?.TimeActivity?.Id;
      return NextResponse.json({
        ok: true,
        summary: `Pushed ${hours}h TimeActivity to QuickBooks for employee ${employeeRef}${qbId ? ` (Id ${qbId})` : ""}.`,
        qbId,
        detail: json,
      });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "QuickBooks action failed" },
      { status: 500 },
    );
  }
}
