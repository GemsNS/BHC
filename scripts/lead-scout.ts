#!/usr/bin/env tsx
/**
 * BHC Lead Scout — the own-PC web scraper the Mainframe agent directs.
 *
 * Runs on the owner's PC (residential IP) or any box that can reach the CRM.
 * Every cycle it heartbeats to /api/scout, claims scans the agent queued
 * (request_web_scan) or an operator queued (Automation hub), scrapes
 * Kijiji / Craigslist / Reddit / DuckDuckGo (+ Facebook Marketplace with a
 * saved ops session), and POSTs homeowner-demand listings back. The server
 * dedupes, triages with AI, creates leads, and drafts replies.
 *
 *   npm run scout                       # one cycle (default: --once)
 *   npm run scout -- --daemon           # 24/7 loop (Scheduled Task / systemd)
 *   npm run scout -- --dry-run          # print, never POST
 *   npm run scout -- --platforms kijiji,reddit
 *   npm run scout -- --login            # save a Facebook ops session (Playwright)
 *
 * ENV (.env next to package.json; never commit secrets)
 *   BHC_BASE_URL=https://bhcontracting.ca   # CRM origin (default http://127.0.0.1:3000)
 *   ADS_INBOUND_SECRET=...                  # must match the server
 *   SCOUT_RUNNER_ID=my-pc                   # default: os.hostname()
 *   SCOUT_RUNNER_NAME="Owner PC"
 *   SCOUT_INTERVAL_MIN=10                   # daemon cycle
 *   SCOUT_SWEEP_MIN=30                      # default-query sweep cadence
 *   SCOUT_PLATFORMS=kijiji,craigslist,reddit,web   # + facebook when FB_SESSION_STATE is set
 *   SCOUT_REGION="Halifax Regional Municipality"
 *   SCOUT_STATE_FILE=data/scout-state.json
 *   FB_SESSION_STATE=/path/outside/git/state.json   # optional Facebook session (--login)
 *   FB_SCRAPE_HEADLESS=1
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import "dotenv/config";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { RawAd } from "../src/lib/ad-ingest";
import {
  FACEBOOK_DEMAND_QUERIES,
  buildMarketplaceSearchUrl,
  normalizeFacebookListings,
  type FacebookMarketplaceListing,
} from "../src/lib/facebook-marketplace";
import {
  SCOUT_DEFAULT_QUERIES,
  SCOUT_DEFAULT_REGION,
  SCOUT_PLATFORMS,
  parseScoutPlatform,
} from "../src/lib/lead-scout";
import { runScoutQuery, type ScoutQueryResult } from "../src/lib/scout-platforms";
import type { ScoutPlatform, ScoutTask } from "../src/lib/types";

const VERSION = "1.0.0";

/* --------------------------------- args ---------------------------------- */

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const opt = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const DAEMON = has("--daemon");
const DRY_RUN = has("--dry-run");
const LOGIN = has("--login");

/* ---------------------------------- env ---------------------------------- */

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]?.trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const BASE_URL = (process.env.BHC_BASE_URL?.trim() || "http://127.0.0.1:3000").replace(/\/+$/, "");
const SCOUT_URL = `${BASE_URL}/api/scout`;
const SECRET = process.env.ADS_INBOUND_SECRET?.trim() || "";
const RUNNER_ID = (process.env.SCOUT_RUNNER_ID?.trim() || os.hostname() || "scout").slice(0, 80);
const RUNNER_NAME = process.env.SCOUT_RUNNER_NAME?.trim() || RUNNER_ID;
const INTERVAL_MIN = envInt("SCOUT_INTERVAL_MIN", 10);
const SWEEP_MIN = envInt("SCOUT_SWEEP_MIN", 30);
const REGION = process.env.SCOUT_REGION?.trim() || SCOUT_DEFAULT_REGION;
const STATE_FILE = process.env.SCOUT_STATE_FILE?.trim() || path.join(process.cwd(), "data", "scout-state.json");
const FB_SESSION_STATE = process.env.FB_SESSION_STATE?.trim() || "";
const FB_HEADLESS = (process.env.FB_SCRAPE_HEADLESS ?? "1") !== "0";
const BLOCK_MINUTES = 60;
const SEEN_CAP = 5000;

function resolvePlatforms(): ScoutPlatform[] {
  const raw = opt("--platforms") ?? process.env.SCOUT_PLATFORMS?.trim() ?? "";
  let list: ScoutPlatform[];
  if (raw) {
    list = raw
      .split(/[,\s]+/)
      .map(parseScoutPlatform)
      .filter((p): p is ScoutPlatform => p !== null);
  } else {
    list = ["kijiji", "craigslist", "reddit", "web"];
    if (FB_SESSION_STATE) list.push("facebook");
  }
  if (list.includes("facebook") && !FB_SESSION_STATE) {
    log("facebook skipped — FB_SESSION_STATE not set (run with --login first)");
    list = list.filter((p) => p !== "facebook");
  }
  return [...new Set(list)].filter((p) => SCOUT_PLATFORMS.includes(p));
}

/* --------------------------------- utils --------------------------------- */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => min + Math.floor(Math.random() * (max - min));

function log(msg: string): void {
  console.log(`[lead-scout ${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

let stopping = false;
process.on("SIGINT", () => {
  if (stopping) process.exit(130);
  stopping = true;
  log("SIGINT — finishing the current step, then exiting");
});
process.on("SIGTERM", () => {
  stopping = true;
});

/* --------------------------------- state --------------------------------- */

type ScoutState = {
  seen: string[];
  blockedUntil: Partial<Record<ScoutPlatform, string>>;
  lastSweepAt: string | null;
  cycles: number;
};

async function loadState(): Promise<ScoutState> {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<ScoutState>;
    return {
      seen: Array.isArray(parsed.seen) ? parsed.seen.filter((s) => typeof s === "string") : [],
      blockedUntil: parsed.blockedUntil ?? {},
      lastSweepAt: typeof parsed.lastSweepAt === "string" ? parsed.lastSweepAt : null,
      cycles: typeof parsed.cycles === "number" ? parsed.cycles : 0,
    };
  } catch {
    return { seen: [], blockedUntil: {}, lastSweepAt: null, cycles: 0 };
  }
}

async function saveState(state: ScoutState): Promise<void> {
  if (state.seen.length > SEEN_CAP) state.seen = state.seen.slice(-SEEN_CAP);
  try {
    await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
  } catch (err) {
    log(`state save failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function isBlocked(state: ScoutState, platform: ScoutPlatform): boolean {
  const until = state.blockedUntil[platform];
  if (!until) return false;
  if (Date.now() < new Date(until).getTime()) return true;
  delete state.blockedUntil[platform];
  return false;
}

function block(state: ScoutState, platform: ScoutPlatform): void {
  state.blockedUntil[platform] = new Date(Date.now() + BLOCK_MINUTES * 60_000).toISOString();
  log(`${platform} rate-limited — pausing it for ${BLOCK_MINUTES} min`);
}

/* ------------------------------ CRM transport ------------------------------ */

async function api<T = Record<string, unknown>>(
  method: "GET" | "POST",
  body?: Record<string, unknown>,
  query = "",
): Promise<T | null> {
  if (DRY_RUN && method === "POST") return null;
  try {
    const res = await fetch(`${SCOUT_URL}${query}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-bhc-inbound-secret": SECRET,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log(`CRM ${method} ${res.status}: ${text.slice(0, 160)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    log(`CRM ${method} failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function postResults(
  platform: ScoutPlatform,
  raws: RawAd[],
  taskId?: string,
): Promise<{ created: number; qualified: number }> {
  const totals = { created: 0, qualified: 0 };
  if (!raws.length) return totals;
  if (DRY_RUN) {
    log(`[dry-run] ${platform}: ${raws.length} demand listing(s)`);
    for (const r of raws) console.log(`    - ${r.title}${r.url ? `  ${r.url}` : ""}`);
    return totals;
  }
  for (let i = 0; i < raws.length; i += 50) {
    const batch = raws.slice(i, i + 50).map((r) => ({
      title: r.title,
      body: r.body ?? "",
      url: r.url ?? "",
      location: r.location ?? "",
      externalId: r.externalId,
      postedAt: r.postedAt ?? null,
      contactName: r.contactName ?? "",
      contactEmail: r.contactEmail ?? "",
      contactPhone: r.contactPhone ?? "",
    }));
    const res = await api<{ created?: number; qualified?: number }>("POST", {
      action: "results",
      runnerId: RUNNER_ID,
      platform,
      taskId,
      listings: batch,
    });
    totals.created += res?.created ?? 0;
    totals.qualified += res?.qualified ?? 0;
    if (i + 50 < raws.length) await sleep(1200);
  }
  return totals;
}

/* ------------------------------- facebook -------------------------------- */

async function loadPlaywright(): Promise<any> {
  const mod = "playwright";
  try {
    return await import(mod);
  } catch {
    log("Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium");
    return null;
  }
}

async function doLogin(): Promise<void> {
  if (!FB_SESSION_STATE) {
    console.error("Set FB_SESSION_STATE to a path outside git, e.g. C:\\bhc-secrets\\fb-session.json");
    process.exit(2);
  }
  const pw = await loadPlaywright();
  if (!pw) process.exit(2);
  const browser = await pw.chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("https://www.facebook.com/login");
  console.log("Log in as the OPS account in the opened window, then press Enter here…");
  await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
  await fs.mkdir(path.dirname(FB_SESSION_STATE), { recursive: true }).catch(() => undefined);
  await ctx.storageState({ path: FB_SESSION_STATE });
  console.log(`Saved session -> ${FB_SESSION_STATE}`);
  await browser.close();
}

async function scrapeFacebook(queries: string[]): Promise<ScoutQueryResult> {
  const result: ScoutQueryResult = { raws: [], error: null, blocked: false, requests: 0 };
  if (!FB_SESSION_STATE) {
    result.error = "FB_SESSION_STATE not set";
    return result;
  }
  const pw = await loadPlaywright();
  if (!pw) {
    result.error = "playwright missing";
    return result;
  }
  const browser = await pw.chromium.launch({ headless: FB_HEADLESS });
  const ctx = await browser.newContext({ storageState: FB_SESSION_STATE, locale: "en-CA" });
  const page = await ctx.newPage();
  const collected: FacebookMarketplaceListing[] = [];
  try {
    for (const q of queries) {
      if (stopping) break;
      const url = buildMarketplaceSearchUrl(q, process.env.FB_CITY_SLUG?.trim() || "halifax");
      result.requests += 1;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
      await sleep(jitter(3000, 4500));
      if (/login|checkpoint/i.test(page.url())) {
        result.blocked = true;
        result.error = "facebook session expired or checkpoint — re-run --login";
        break;
      }
      const items = await page
        .$$eval('a[href*="/marketplace/item/"]', (as: any[]) =>
          as.map((a: any) => {
            const el = a as { href: string; innerText: string };
            const text = (el.innerText || "").split("\n").map((s: string) => s.trim()).filter(Boolean);
            return { url: el.href, title: text.find((t: string) => t.length > 8) || text[0] || "", raw: text.join(" · ") };
          }),
        )
        .catch(() => [] as Array<{ url: string; title: string; raw: string }>);
      for (const it of items) collected.push({ url: it.url, title: it.title, description: it.raw, location: "Halifax" });
      await sleep(jitter(2000, 3500));
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    await browser.close().catch(() => undefined);
  }
  result.raws = normalizeFacebookListings(collected, { demandOnly: true });
  return result;
}

/* --------------------------------- cycle --------------------------------- */

async function runPlatformQuery(platform: ScoutPlatform, query: string): Promise<ScoutQueryResult> {
  if (platform === "facebook") return scrapeFacebook([query]);
  return runScoutQuery(platform, query, { region: REGION, sleep });
}

function unseen(state: ScoutState, raws: RawAd[]): RawAd[] {
  const seen = new Set(state.seen);
  const out: RawAd[] = [];
  for (const r of raws) {
    const key = r.externalId || r.url || r.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function remember(state: ScoutState, raws: RawAd[]): void {
  for (const r of raws) {
    const key = r.externalId || r.url || r.title;
    if (key) state.seen.push(key);
  }
}

async function runTask(task: ScoutTask, state: ScoutState): Promise<string> {
  if (isBlocked(state, task.platform)) {
    await api("POST", { action: "complete", runnerId: RUNNER_ID, taskId: task.id, found: 0, created: 0, error: `${task.platform} paused after rate limit` });
    return `${task.platform} "${task.query}": paused (rate limit)`;
  }
  const r = await runPlatformQuery(task.platform, task.query);
  if (r.blocked) block(state, task.platform);
  const fresh = unseen(state, r.raws);
  const posted = await postResults(task.platform, fresh, task.id);
  remember(state, fresh);
  await api("POST", {
    action: "complete",
    runnerId: RUNNER_ID,
    taskId: task.id,
    found: r.raws.length,
    created: posted.created,
    error: r.error && !r.raws.length ? r.error : null,
  });
  return `${task.platform} "${task.query}": ${r.raws.length} demand · ${fresh.length} new · ${posted.created} created${r.error ? ` · ${r.error}` : ""}`;
}

async function sweep(platforms: ScoutPlatform[], state: ScoutState): Promise<string[]> {
  const lines: string[] = [];
  for (const platform of platforms) {
    if (stopping) break;
    if (isBlocked(state, platform)) {
      lines.push(`${platform}: paused`);
      continue;
    }
    const queries = SCOUT_DEFAULT_QUERIES[platform] ?? [];
    let demand = 0;
    let fresh: RawAd[] = [];
    let error: string | null = null;
    if (platform === "facebook") {
      const r = await scrapeFacebook([...FACEBOOK_DEMAND_QUERIES]);
      if (r.blocked) block(state, platform);
      demand = r.raws.length;
      fresh = unseen(state, r.raws);
      error = r.error;
    } else {
      for (const q of queries) {
        if (stopping) break;
        const r = await runPlatformQuery(platform, q);
        if (r.blocked) {
          block(state, platform);
          error = r.error;
          break;
        }
        demand += r.raws.length;
        fresh.push(...unseen(state, r.raws));
        if (r.error) error = r.error;
        // Reddit throttles unauthenticated feeds (~10 req/min); everyone else is fine at 2-4 s.
        await sleep(platform === "reddit" ? jitter(7000, 10_000) : jitter(2000, 4000));
      }
      // Same listing can surface for several queries — post once.
      const dedup = new Map<string, RawAd>();
      for (const r of fresh) dedup.set(r.externalId || r.url || r.title, r);
      fresh = [...dedup.values()];
    }
    const posted = await postResults(platform, fresh);
    remember(state, fresh);
    lines.push(`${platform}: ${demand} demand · ${fresh.length} new · ${posted.created} created${error ? ` · ${error}` : ""}`);
  }
  return lines;
}

async function cycle(platforms: ScoutPlatform[], state: ScoutState): Promise<void> {
  state.cycles += 1;
  const summaryParts: string[] = [];

  // 1) heartbeat
  await api("POST", {
    action: "heartbeat",
    runner: { id: RUNNER_ID, name: RUNNER_NAME, host: os.hostname(), version: VERSION, platforms },
  });

  // 2) queued tasks → claim → run
  const queue = await api<{ tasks?: ScoutTask[] }>("GET", undefined, `?runner=${encodeURIComponent(RUNNER_ID)}`);
  const wanted = (queue?.tasks ?? []).filter((t) => platforms.includes(t.platform)).slice(0, 5);
  let claimed: ScoutTask[] = [];
  if (wanted.length) {
    const res = await api<{ tasks?: ScoutTask[] }>("POST", {
      action: "claim",
      runnerId: RUNNER_ID,
      taskIds: wanted.map((t) => t.id),
      limit: wanted.length,
    });
    claimed = DRY_RUN ? wanted : (res?.tasks ?? []);
  }
  log(`cycle ${state.cycles}: ${claimed.length} task(s) claimed`);
  for (const task of claimed) {
    if (stopping) break;
    const line = await runTask(task, state);
    log(`task ${line}`);
    summaryParts.push(line);
    await sleep(jitter(1500, 3000));
  }

  // 3) default sweep when due
  const lastSweep = state.lastSweepAt ? new Date(state.lastSweepAt).getTime() : 0;
  if (!stopping && Date.now() - lastSweep >= SWEEP_MIN * 60_000) {
    log(`sweep: ${platforms.join(", ")}`);
    const lines = await sweep(platforms, state);
    for (const l of lines) log(`sweep ${l}`);
    summaryParts.push(...lines);
    state.lastSweepAt = new Date().toISOString();
  }

  await saveState(state);
  await api("POST", {
    action: "heartbeat",
    runner: { id: RUNNER_ID, name: RUNNER_NAME, host: os.hostname(), version: VERSION, platforms },
    summary: summaryParts.join(" | ").slice(0, 400) || "idle",
  });
}

/* ---------------------------------- main --------------------------------- */

async function main(): Promise<void> {
  if (LOGIN) return doLogin();
  const platforms = resolvePlatforms();
  if (!platforms.length) {
    console.error("No platforms enabled (SCOUT_PLATFORMS / --platforms).");
    process.exit(2);
  }
  if (!SECRET && !DRY_RUN) {
    console.error("ADS_INBOUND_SECRET is not set — the CRM will reject results. Use --dry-run to test scraping only.");
    process.exit(2);
  }
  log(`runner=${RUNNER_ID} crm=${SCOUT_URL} platforms=${platforms.join(",")} mode=${DAEMON ? "daemon" : "once"}${DRY_RUN ? " dry-run" : ""}`);
  const state = await loadState();

  if (!DAEMON) {
    await cycle(platforms, state);
    return;
  }
  while (!stopping) {
    try {
      await cycle(platforms, state);
    } catch (err) {
      log(`cycle failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (stopping) break;
    log(`sleeping ${INTERVAL_MIN} min`);
    const wake = Date.now() + INTERVAL_MIN * 60_000;
    while (!stopping && Date.now() < wake) await sleep(Math.min(5000, wake - Date.now()));
  }
  log("stopped");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(DAEMON ? 0 : 1);
});
