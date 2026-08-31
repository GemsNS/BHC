import type { AppData } from "./types";
import {
  MARKET_COMPETITORS,
  MARKET_SYMBOLS,
  type CompetitorSeed,
} from "./market-competitors";
import { withBasePath } from "./paths";

export type MarketTicker = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  history: number[];
  category: "commodity" | "sector" | "macro" | "internal";
};

export type CompetitorIntel = CompetitorSeed & {
  changePct: number;
  lastSeen: string;
  estJobsActive: number;
};

export type MarketHeadline = {
  id: string;
  time: string;
  tag: string;
  text: string;
  tone: "up" | "down" | "neutral";
};

export type WeatherIntel = {
  location: string;
  tempF: number;
  precipMm: number;
  windMph: number;
  condition: string;
  fieldNote: string;
};

export type MarketSignal = {
  id: string;
  priority: "high" | "medium" | "low";
  label: string;
  detail: string;
  href?: string;
};

export type MarketPulse = {
  updatedAt: string;
  source: "live" | "synthetic" | "mixed";
  tickers: MarketTicker[];
  competitors: CompetitorIntel[];
  headlines: MarketHeadline[];
  weather: WeatherIntel | null;
  signals: MarketSignal[];
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic pseudo-live price path — stable between refreshes within same minute */
function simulatePrice(base: number, symbol: string, now: number): { price: number; history: number[] } {
  if (base <= 0) return { price: 0, history: [] };
  const seed = hashStr(symbol);
  const history: number[] = [];
  for (let i = 19; i >= 0; i--) {
    const t = now - i * 180000;
    const wave = Math.sin(t / 5400000 + seed) * 0.012;
    const micro = Math.sin(t / 420000 + seed * 0.7) * 0.004;
    history.push(base * (1 + wave + micro));
  }
  const price = history[history.length - 1] ?? base;
  return { price, history };
}

function internalBases(data: AppData) {
  const pipelineValue = data.deals
    .filter((d) => !d.stage.startsWith("closed"))
    .reduce((s, d) => s + (d.amount || 0), 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const fuelMonth = data.fuelLogs
    .filter((f) => new Date(f.filledAt) >= monthStart)
    .reduce((s, f) => s + f.cost, 0);
  const knocksToday = data.knocks.filter((k) => {
    const d = new Date(k.createdAt);
    return d.toDateString() === new Date().toDateString();
  }).length;
  return { pipelineValue, fuelMonth, knocksToday };
}

function buildTickers(data: AppData, now: number): MarketTicker[] {
  const internal = internalBases(data);
  return MARKET_SYMBOLS.map((s) => {
    let base = s.base;
    if (s.symbol === "BHC-PIPE") base = internal.pipelineValue || 125000;
    if (s.symbol === "BHC-FUEL") base = internal.fuelMonth || 2400;
    if (s.symbol === "BHC-KNOCK") base = internal.knocksToday || 12;
    const { price, history } = simulatePrice(base, s.symbol, now);
    const prev = history[history.length - 2] ?? price;
    const change = price - prev;
    const changePct = prev ? (change / prev) * 100 : 0;
    return {
      symbol: s.symbol,
      name: s.name,
      price,
      change,
      changePct,
      history,
      category: s.category,
    };
  });
}

function buildCompetitors(now: number): CompetitorIntel[] {
  return MARKET_COMPETITORS.map((c) => {
    const seed = hashStr(c.id);
    const drift = Math.sin(now / 7200000 + seed) * 0.018;
    const changePct = drift * 100;
    const pricePerSqFt = Math.round(c.pricePerSqFt * (1 + drift) * 100) / 100;
    const estJobsActive = 3 + (seed % 8);
    return {
      ...c,
      pricePerSqFt,
      changePct,
      lastSeen: new Date(now - (seed % 3600000)).toISOString(),
      estJobsActive,
    };
  });
}

function buildHeadlines(tickers: MarketTicker[], competitors: CompetitorIntel[]): MarketHeadline[] {
  const now = new Date();
  const t = (mins: number) =>
    new Date(now.getTime() - mins * 60000).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  const headlines: MarketHeadline[] = [];
  const lumber = tickers.find((x) => x.symbol === "LBR");
  const mortgage = tickers.find((x) => x.symbol === "MORT");
  const itb = tickers.find((x) => x.symbol === "ITB");
  const cheapest = [...competitors].sort((a, b) => a.pricePerSqFt - b.pricePerSqFt)[0];

  if (lumber) {
    headlines.push({
      id: "lbr",
      time: t(2),
      tag: "COMMODITY",
      text: `Lumber composite ${lumber.changePct >= 0 ? "↑" : "↓"} ${Math.abs(lumber.changePct).toFixed(2)}% — adjust material buffers on bids > $40k.`,
      tone: lumber.changePct >= 0 ? "up" : "down",
    });
  }
  if (mortgage) {
    headlines.push({
      id: "mort",
      time: t(5),
      tag: "MACRO",
      text: `30Y mortgage at ${mortgage.price.toFixed(2)}% — ${mortgage.changePct > 0 ? "financing friction rising" : "buyer leverage improving"}.`,
      tone: mortgage.changePct > 0 ? "down" : "up",
    });
  }
  if (itb) {
    headlines.push({
      id: "itb",
      time: t(8),
      tag: "SECTOR",
      text: `Homebuilders ETF ${itb.changePct >= 0 ? "firm" : "soft"} (${itb.changePct >= 0 ? "+" : ""}${itb.changePct.toFixed(2)}%) — ${itb.changePct >= 0 ? "storm-season demand tailwind" : "watch lead conversion times"}.`,
      tone: itb.changePct >= 0 ? "up" : "down",
    });
  }
  if (cheapest) {
    headlines.push({
      id: "comp",
      time: t(11),
      tag: "COMPETITOR",
      text: `${cheapest.name} holding ${cheapest.pricePerSqFt.toFixed(2)}/sqft — lowest in ${cheapest.region}.`,
      tone: "neutral",
    });
  }
  headlines.push({
    id: "intel",
    time: t(14),
    tag: "BHC INTEL",
    text: "Approve outreach drafts before send — GoDaddy SMTP hooks in when ready.",
    tone: "neutral",
  });
  return headlines;
}

function buildSignals(data: AppData, competitors: CompetitorIntel[]): MarketSignal[] {
  const signals: MarketSignal[] = [];
  const avgComp =
    competitors.reduce((s, c) => s + c.pricePerSqFt, 0) / (competitors.length || 1);
  const bhcEstimate = 5.25;
  const delta = bhcEstimate - avgComp;

  if (delta > 0.15) {
    signals.push({
      id: "price-room",
      priority: "medium",
      label: "PRICING POWER",
      detail: `BHC target ~$${bhcEstimate.toFixed(2)}/sqft vs market avg $${avgComp.toFixed(2)} — room to win on value, not race to bottom.`,
      href: "/admin/sales?tab=pipeline",
    });
  } else {
    signals.push({
      id: "price-pressure",
      priority: "high",
      label: "MARGIN PRESSURE",
      detail: `Market avg $${avgComp.toFixed(2)}/sqft — competitors compressing. Stress upsells & speed-to-estimate.`,
      href: "/admin/sales?tab=pipeline",
    });
  }

  const openLeads = data.leads.filter((l) => !["won", "lost"].includes(l.status)).length;
  if (openLeads >= 5) {
    signals.push({
      id: "pipeline",
      priority: "high",
      label: "PIPELINE HEAT",
      detail: `${openLeads} open leads — prioritize qualified → estimate this week.`,
      href: "/admin/sales?tab=pipeline",
    });
  }

  const lowStock = data.inventory.filter((i) => i.quantityOnHand <= i.reorderLevel).length;
  if (lowStock > 0) {
    signals.push({
      id: "stock",
      priority: "medium",
      label: "SUPPLY RISK",
      detail: `${lowStock} SKU(s) at reorder — sync with lumber/steel moves before big installs.`,
      href: "/admin/inventory",
    });
  }

  const pending = data.outreachQueue.filter((o) => o.status === "pending_approval").length;
  if (pending > 0) {
    signals.push({
      id: "outreach",
      priority: "low",
      label: "OUTREACH QUEUE",
      detail: `${pending} draft(s) awaiting approval — clear queue to capture storm-window demand.`,
      href: "/admin/sales?tab=outreach",
    });
  }

  return signals.slice(0, 5);
}

export async function fetchWeatherIntel(): Promise<WeatherIntel | null> {
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=44.6488&longitude=-63.5752&current=temperature_2m,precipitation,wind_speed_10m,weather_code&timezone=America%2FHalifax";
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      current: {
        temperature_2m: number;
        precipitation: number;
        wind_speed_10m: number;
        weather_code: number;
      };
    };
    const c = json.current;
    const tempF = Math.round((c.temperature_2m * 9) / 5 + 32);
    const windMph = Math.round(c.wind_speed_10m * 0.621);
    const condition =
      c.weather_code >= 80
        ? "Storms likely"
        : c.precipitation > 0
          ? "Precip active"
          : c.wind_speed_10m > 25
            ? "Wind advisory"
            : "Clear / workable";
    const fieldNote =
      c.precipitation > 0 || c.weather_code >= 80
        ? "Delay steep-slope work; shift crew to interior / shop prep."
        : windMph > 20
          ? "Harness checks mandatory; consider afternoon cutoffs."
          : "Green light for field installs and canvass routes.";
    return {
      location: "Halifax Regional Municipality",
      tempF,
      precipMm: c.precipitation,
      windMph,
      condition,
      fieldNote,
    };
  } catch {
    return null;
  }
}

/** Try Yahoo chart API for a symbol — returns null on rate limit / failure */
async function fetchYahooQuote(symbol: string): Promise<{ price: number; changePct: number } | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BHC-Market/1.0)" },
        next: { revalidate: 120 },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number; previousClose?: number };
        }>;
      };
    };
    const meta = json.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const prev = meta.previousClose ?? meta.regularMarketPrice;
    const changePct = prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0;
    return { price: meta.regularMarketPrice, changePct };
  } catch {
    return null;
  }
}

const YAHOO_MAP: Record<string, string> = {
  ITB: "ITB",
  XHB: "XHB",
  HG: "HG=F",
};

async function enrichTickersFromLive(tickers: MarketTicker[]): Promise<{ tickers: MarketTicker[]; live: boolean }> {
  let live = false;
  const out = await Promise.all(
    tickers.map(async (t) => {
      const yahooSym = YAHOO_MAP[t.symbol];
      if (!yahooSym) return t;
      const q = await fetchYahooQuote(yahooSym);
      if (!q) return t;
      live = true;
      const change = (t.price * q.changePct) / 100;
      return {
        ...t,
        price: q.price,
        change,
        changePct: q.changePct,
        history: [...t.history.slice(0, -1), q.price],
      };
    }),
  );
  return { tickers: out, live };
}

export async function buildMarketPulse(data: AppData): Promise<MarketPulse> {
  const now = Date.now();
  let tickers = buildTickers(data, now);
  const { tickers: enriched, live } = await enrichTickersFromLive(tickers);
  tickers = enriched;
  const competitors = buildCompetitors(now);
  const weather = await fetchWeatherIntel();
  const headlines = buildHeadlines(tickers, competitors);
  const signals = buildSignals(data, competitors);

  return {
    updatedAt: new Date(now).toISOString(),
    source: live ? (weather ? "mixed" : "live") : weather ? "mixed" : "synthetic",
    tickers,
    competitors,
    headlines,
    weather,
    signals,
  };
}

/** Client loader — API in full mode, local build in static demo */
export async function loadMarketPulse(): Promise<MarketPulse> {
  const { loadAppData } = await import("./client-data");
  const { isStaticDemo } = await import("./paths");
  const data = await loadAppData();

  if (!isStaticDemo()) {
    try {
      const res = await fetch(withBasePath("/api/markets"));
      if (res.ok) return (await res.json()) as MarketPulse;
    } catch {
      /* fall through */
    }
  }

  return buildMarketPulse(data);
}
