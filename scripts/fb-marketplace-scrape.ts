#!/usr/bin/env tsx
/**
 * Operator browser sidecar — realtime Facebook Marketplace + Kijiji demand.
 *
 * Runs on the production host (or a sibling box) with an OPS-OWNED browser
 * session, scrapes HRM demand listings, and POSTs them to /api/ads/inbound.
 * Nothing here is imported by the app or the tests; Playwright is loaded
 * dynamically so the repo never depends on it and no cookies are committed.
 *
 * SAFETY / SCOPE
 *   - Uses an ops Facebook session you created by logging in yourself once.
 *     No credential stuffing, no login automation, no auth bypass.
 *   - The session lives OUTSIDE git (FB_SESSION_STATE, e.g. /etc/bhc/fb-session/state.json).
 *   - Halifax Marketplace only; demand queries only; polite delays; soft-fail.
 *
 * ONE-TIME SETUP (ops, on the host)
 *   npm i -D playwright && npx playwright install chromium
 *   # Log in as the ops FB account and save the session:
 *   npx tsx scripts/fb-marketplace-scrape.ts --login   # opens a browser, waits, saves state
 *
 * ENV (put in /opt/bhc/.env; never commit)
 *   ADS_INBOUND_SECRET=...            # must match the server
 *   BHC_INBOUND_URL=http://127.0.0.1:3000/api/ads/inbound
 *   FB_SESSION_STATE=/etc/bhc/fb-session/state.json
 *   FB_SCRAPE_HEADLESS=1              # 0 to watch it run
 *
 * RUN
 *   npx tsx scripts/fb-marketplace-scrape.ts               # facebook (default)
 *   npx tsx scripts/fb-marketplace-scrape.ts --site kijiji # kijiji (residential egress)
 *   npx tsx scripts/fb-marketplace-scrape.ts --dry-run     # print, do not POST
 */

// Playwright is a host-only dependency loaded via a dynamic import, so its
// browser/page objects are untyped here — `any` is intentional in this ops script.
/* eslint-disable @typescript-eslint/no-explicit-any */
import "dotenv/config";
import {
  FACEBOOK_DEMAND_QUERIES,
  buildMarketplaceSearchUrl,
  normalizeFacebookListings,
  type FacebookMarketplaceListing,
} from "../src/lib/facebook-marketplace";
import {
  KIJIJI_DEMAND_QUERIES,
  buildKijijiServicesUrl,
  normalizeKijijiListings,
} from "../src/lib/kijiji-realtime";
import { parseKijijiSearchHtml, type RawAd } from "../src/lib/ad-ingest";

type Site = "facebook" | "kijiji";

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const opt = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const SITE = ((opt("--site") as Site) || "facebook") as Site;
const DRY_RUN = has("--dry-run");
const LOGIN = has("--login");
const HEADLESS = (process.env.FB_SCRAPE_HEADLESS ?? "1") !== "0";
const SESSION_STATE = process.env.FB_SESSION_STATE?.trim() || "";
const INBOUND_URL = process.env.BHC_INBOUND_URL?.trim() || "http://127.0.0.1:3000/api/ads/inbound";
const INBOUND_SECRET = process.env.ADS_INBOUND_SECRET?.trim() || "";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// playwright is a HOST-ONLY dependency (installed by ops, never in package.json).
// The variable specifier stops the bundler/tsc from trying to resolve it here.
async function loadPlaywright(): Promise<any> {
  const mod = "playwright";
  try {
    return await import(mod);
  } catch {
    console.error(
      "Playwright is not installed. On the host run:\n" +
        "  npm i -D playwright && npx playwright install chromium",
    );
    process.exit(2);
  }
}

/** One-time: open a browser so the operator logs in, then save the session. */
async function doLogin(): Promise<void> {
  if (!SESSION_STATE) {
    console.error("Set FB_SESSION_STATE to a path outside git, e.g. /etc/bhc/fb-session/state.json");
    process.exit(2);
  }
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("https://www.facebook.com/login");
  console.log("Log in as the OPS account in the opened window, then press Enter here…");
  await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
  await ctx.storageState({ path: SESSION_STATE });
  console.log(`Saved session -> ${SESSION_STATE}`);
  await browser.close();
}

async function postInbound(raws: RawAd[]): Promise<void> {
  if (DRY_RUN) {
    console.log(`[dry-run] ${raws.length} demand listing(s):`);
    for (const r of raws) console.log(`  - ${r.title}${r.url ? `  ${r.url}` : ""}`);
    return;
  }
  if (!INBOUND_SECRET) {
    console.error("ADS_INBOUND_SECRET is not set — cannot POST to the CRM.");
    process.exit(2);
  }
  let ok = 0;
  for (const raw of raws) {
    const res = await fetch(INBOUND_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bhc-inbound-secret": INBOUND_SECRET },
      body: JSON.stringify({
        title: raw.title,
        body: raw.body,
        url: raw.url,
        location: raw.location,
        externalId: raw.externalId,
        postedAt: raw.postedAt,
        contactEmail: raw.contactEmail,
        contactPhone: raw.contactPhone,
      }),
    }).catch((e) => {
      console.error(`  POST failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    });
    if (res && res.ok) ok += 1;
    await sleep(1200); // be polite to our own server + avoid bursts
  }
  console.log(`Posted ${ok}/${raws.length} listing(s) to ${INBOUND_URL}`);
}

async function scrapeFacebook(): Promise<RawAd[]> {
  if (!SESSION_STATE) {
    console.error("Set FB_SESSION_STATE (run with --login first).");
    process.exit(2);
  }
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext({ storageState: SESSION_STATE, locale: "en-CA" });
  const page = await ctx.newPage();
  const collected: FacebookMarketplaceListing[] = [];
  try {
    for (const q of FACEBOOK_DEMAND_QUERIES) {
      const url = buildMarketplaceSearchUrl(q, process.env.FB_CITY_SLUG?.trim() || "halifax");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
      await sleep(3500);
      // Extract visible Marketplace item cards (title + item link) from the DOM.
      const items = await page
        .$$eval('a[href*="/marketplace/item/"]', (as: any[]) =>
          as.map((a: any) => {
            const el = a as { href: string; innerText: string };
            const text = (el.innerText || "").split("\n").map((s: string) => s.trim()).filter(Boolean);
            return {
              url: el.href,
              title: text.find((t) => t.length > 8) || text[0] || "",
              raw: text.join(" · "),
            };
          }),
        )
        .catch(() => [] as Array<{ url: string; title: string; raw: string }>);
      for (const it of items) {
        collected.push({ url: it.url, title: it.title, description: it.raw, location: "Halifax" });
      }
      await sleep(2500); // polite gap between queries
    }
  } finally {
    await browser.close();
  }
  return normalizeFacebookListings(collected, { demandOnly: true });
}

async function scrapeKijiji(): Promise<RawAd[]> {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext({ locale: "en-CA" });
  const page = await ctx.newPage();
  const all: RawAd[] = [];
  try {
    for (const q of KIJIJI_DEMAND_QUERIES) {
      const url = buildKijijiServicesUrl(q);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
      await sleep(2500);
      const html = await page.content().catch(() => "");
      if (html) all.push(...parseKijijiSearchHtml(html));
      await sleep(2500);
    }
  } finally {
    await browser.close();
  }
  return normalizeKijijiListings(all);
}

async function main(): Promise<void> {
  if (LOGIN) return doLogin();
  console.log(`[fb-marketplace-scrape] site=${SITE} headless=${HEADLESS} dry-run=${DRY_RUN}`);
  const raws = SITE === "kijiji" ? await scrapeKijiji() : await scrapeFacebook();
  console.log(`Found ${raws.length} demand listing(s) after filtering.`);
  await postInbound(raws);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
