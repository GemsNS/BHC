import { NextRequest, NextResponse } from "next/server";
import { requireApiEmployee } from "@/lib/api-auth";
import {
  getValidAccessToken,
  qbApiBase,
  readQbConnection,
} from "@/lib/quickbooks-oauth";

type QbReportRow = {
  Header?: { ColData?: Array<{ value?: string }> };
  Summary?: { ColData?: Array<{ value?: string }> };
  Rows?: { Row?: QbReportRow[] };
  ColData?: Array<{ value?: string }>;
  group?: string;
};

function parseAmount(value?: string): number {
  if (!value) return 0;
  const n = Number(String(value).replace(/[,$]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function flattenRows(
  rows: QbReportRow[] | undefined,
  bucket: Array<{ label: string; amount: number; group?: string }>,
  group?: string,
) {
  if (!rows) return;
  for (const row of rows) {
    const nextGroup = row.group || group;
    if (row.Header?.ColData?.[0]?.value) {
      const label = row.Header.ColData[0].value;
      const amount = parseAmount(row.Summary?.ColData?.[1]?.value ?? row.ColData?.[1]?.value);
      if (label) bucket.push({ label, amount, group: nextGroup });
    }
    if (row.ColData?.[0]?.value) {
      bucket.push({
        label: row.ColData[0].value,
        amount: parseAmount(row.ColData[1]?.value),
        group: nextGroup,
      });
    }
    flattenRows(row.Rows?.Row, bucket, nextGroup);
  }
}

export async function GET(request: Request) {
  const employee = await requireApiEmployee(request);
  if (employee instanceof NextResponse) return employee;
  const conn = await readQbConnection();
  const configured = Boolean(
    process.env.QUICKBOOKS_CLIENT_ID?.trim() &&
      process.env.QUICKBOOKS_CLIENT_SECRET?.trim() &&
      conn?.refreshToken &&
      conn.realmId,
  );
  return NextResponse.json({
    ok: true,
    envConfigured: configured,
    connected: Boolean(conn?.refreshToken),
    hint: "POST with no body to fetch P&L using server OAuth connection, or connect via Admin → Books.",
  });
}

export async function POST(req: NextRequest) {
  const employee = await requireApiEmployee(req);
  if (employee instanceof NextResponse) return employee;

  try {
    const json = (await req.json().catch(() => ({}))) as Partial<{
      clientId: string;
      clientSecret: string;
      realmId: string;
      refreshToken: string;
      environment: "sandbox" | "production";
    }>;

    let realmId = json.realmId?.trim();
    let environment =
      json.environment ||
      (process.env.QUICKBOOKS_ENV?.trim() as "sandbox" | "production" | undefined) ||
      "sandbox";
    let accessToken: string;
    let refreshTokenOut: string | undefined;

    const useServerOAuth =
      !json.clientId && !json.clientSecret && !json.refreshToken && !json.realmId;

    if (useServerOAuth) {
      const { accessToken: token, connection } = await getValidAccessToken();
      accessToken = token;
      realmId = connection.realmId;
      environment = connection.environment;
      refreshTokenOut = connection.refreshToken;
    } else {
      const clientId = json.clientId?.trim() || process.env.QUICKBOOKS_CLIENT_ID?.trim();
      const clientSecret =
        json.clientSecret?.trim() || process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
      realmId = realmId || process.env.QUICKBOOKS_REALM_ID?.trim();
      const refreshToken =
        json.refreshToken?.trim() || process.env.QUICKBOOKS_REFRESH_TOKEN?.trim();

      if (!clientId || !clientSecret || !realmId || !refreshToken) {
        return NextResponse.json(
          {
            error:
              "Connect QuickBooks in Admin → Books, or provide credentials in request body.",
          },
          { status: 400 },
        );
      }

      const { refreshAccessToken } = await import("@/lib/quickbooks-oauth");
      const tokens = await refreshAccessToken(refreshToken);
      accessToken = tokens.access_token;
      refreshTokenOut = tokens.refresh_token ?? refreshToken;
    }

    if (!realmId) {
      return NextResponse.json({ error: "Missing realm ID" }, { status: 400 });
    }

    const end = new Date();
    const start = new Date();
    start.setFullYear(end.getFullYear() - 2);

    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    const url = new URL(
      `${qbApiBase(environment)}/v3/company/${realmId}/reports/ProfitAndLoss`,
    );
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);
    url.searchParams.set("summarize_column_by", "Year");

    const reportRes = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!reportRes.ok) {
      const text = await reportRes.text();
      return NextResponse.json(
        {
          error: `QuickBooks P&L fetch failed (${reportRes.status}): ${text.slice(0, 300)}`,
        },
        { status: 502 },
      );
    }

    const report = await reportRes.json();
    const flat: Array<{ label: string; amount: number; group?: string }> = [];
    flattenRows(report?.Rows?.Row as QbReportRow[] | undefined, flat);

    const income = flat
      .filter((r) => /income|revenue/i.test(`${r.group ?? ""} ${r.label}`))
      .reduce((s, r) => s + Math.abs(r.amount), 0);
    const cogs = flat
      .filter((r) => /cost of goods|cogs/i.test(`${r.group ?? ""} ${r.label}`))
      .reduce((s, r) => s + Math.abs(r.amount), 0);
    const expenses = flat
      .filter(
        (r) =>
          /expense/i.test(`${r.group ?? ""} ${r.label}`) &&
          !/cost of goods/i.test(`${r.group ?? ""} ${r.label}`),
      )
      .reduce((s, r) => s + Math.abs(r.amount), 0);

    return NextResponse.json({
      source: "quickbooks",
      generatedAt: new Date().toISOString(),
      currency: "USD",
      range: { startDate, endDate },
      refreshToken: refreshTokenOut,
      accessTokenExpiresIn: null,
      totals: {
        revenue: income,
        cogs,
        grossProfit: income - cogs,
        opex: expenses,
        netIncome: income - cogs - expenses,
      },
      lines: flat.slice(0, 80),
      rawHeader: report?.Header ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "QuickBooks request failed" },
      { status: 500 },
    );
  }
}
