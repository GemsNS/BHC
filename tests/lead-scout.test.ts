import { describe, expect, it } from "vitest";
import {
  claimScoutTasks,
  completeScoutTask,
  enqueueScoutTask,
  ensureScoutSource,
  heartbeatScoutRunner,
  ingestScoutResults,
  parseScoutPlatform,
  pruneScout,
  runnerOnline,
  SCOUT_DEFAULT_QUERIES,
  SCOUT_MAX_QUEUED,
  SCOUT_PLATFORMS,
  scoutRawLooksLikeDemand,
  scoutStatus,
} from "@/lib/lead-scout";
import {
  kijijiQueryVariants,
  parseCraigslistStaticHtml,
  parseDuckDuckGoHtml,
  parseRedditSearchJson,
  parseScoutResponse,
  runScoutQuery,
  scoutRequestUrls,
  unwrapDuckDuckGoHref,
} from "@/lib/scout-platforms";
import { buildSeedData } from "@/lib/seed";

const NOW = Date.parse("2026-09-11T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;

let n = 0;
const ctx = { newId: () => `id-${++n}`, nowIso: () => iso(NOW) };

describe("scout platforms + defaults", () => {
  it("knows every platform and has demand queries for each", () => {
    expect(SCOUT_PLATFORMS).toEqual(["kijiji", "craigslist", "reddit", "facebook", "web"]);
    for (const p of SCOUT_PLATFORMS) expect(SCOUT_DEFAULT_QUERIES[p].length, p).toBeGreaterThan(0);
    expect(parseScoutPlatform("Kijiji")).toBe("kijiji");
    expect(parseScoutPlatform("tiktok")).toBeNull();
  });

  it("builds request URLs per platform", () => {
    const kj = scoutRequestUrls("kijiji", "need a deck built");
    expect(kj[0]).toMatch(/kijiji\.ca\/b-services\/city-of-halifax/);
    expect(kj.length).toBe(2); // phrase, then bare trade term "deck"
    expect(kj[1]).toMatch(/keywords=deck$/);
    expect(scoutRequestUrls("kijiji", "siding").length).toBe(1);
    expect(kijijiQueryVariants("looking for siding contractor")).toEqual(["looking for siding contractor", "siding contractor"]);
    const cl = scoutRequestUrls("craigslist", "siding");
    expect(cl[0]).toMatch(/halifax\.craigslist\.org\/search\/sss\?query=siding$/);
    expect(cl[1]).toMatch(/halifax\.craigslist\.org\/search\/ggg\?query=siding$/);
    expect(scoutRequestUrls("reddit", "siding")[0]).toMatch(/reddit\.com\/r\/halifax\/search\.rss\?q=siding/);
    expect(scoutRequestUrls("web", "siding")[0]).toMatch(/html\.duckduckgo\.com\/html\/\?q=/);
    expect(scoutRequestUrls("facebook", "siding")).toEqual([]);
  });
});

describe("task lifecycle", () => {
  it("enqueue dedupes, claim respects runner platforms, complete updates counters", () => {
    const data = buildSeedData();
    const a = enqueueScoutTask(data, { platform: "kijiji", query: "looking for siding contractor", requestedBy: "agent" }, ctx);
    const b = enqueueScoutTask(data, { platform: "kijiji", query: "  Looking For Siding Contractor ", requestedBy: "ui" }, ctx);
    expect(a.existing).toBe(false);
    expect(b.existing).toBe(true);
    expect(b.task.id).toBe(a.task.id);
    enqueueScoutTask(data, { platform: "reddit", query: "deck builder recommendations", requestedBy: "agent" }, ctx);
    expect(data.scoutTasks.filter((t) => t.status === "queued").length).toBe(2);

    heartbeatScoutRunner(data, { id: "pc-1", name: "Office PC", host: "office", version: "1.0.0", platforms: ["kijiji", "web"] }, ctx.nowIso);
    const claimed = claimScoutTasks(data, "pc-1", undefined, 5, ctx.nowIso);
    expect(claimed.map((t) => t.platform)).toEqual(["kijiji"]);
    expect(claimed[0].status).toBe("running");
    expect(claimed[0].claimedBy).toBe("pc-1");
    // reddit task stays queued for a runner that supports it
    expect(data.scoutTasks.find((t) => t.platform === "reddit")?.status).toBe("queued");

    const done = completeScoutTask(data, { taskId: claimed[0].id, runnerId: "pc-1", found: 6, created: 2 }, ctx.nowIso);
    expect(done?.status).toBe("done");
    expect(done?.found).toBe(6);
    const runner = data.scoutRunners.find((r) => r.id === "pc-1")!;
    expect(runner.tasksDone).toBe(1);
    expect(runner.adsPosted).toBe(2);
    // idempotent
    completeScoutTask(data, { taskId: claimed[0].id, runnerId: "pc-1", found: 6, created: 2 }, ctx.nowIso);
    expect(runner.tasksDone).toBe(1);

    const failed = completeScoutTask(data, { taskId: "missing", runnerId: "pc-1", found: 0, created: 0, error: "x" }, ctx.nowIso);
    expect(failed).toBeNull();
  });

  it("caps the queue", () => {
    const data = buildSeedData();
    for (let i = 0; i < SCOUT_MAX_QUEUED; i++) {
      enqueueScoutTask(data, { platform: "web", query: `query number ${i}`, requestedBy: "agent" }, ctx);
    }
    expect(() => enqueueScoutTask(data, { platform: "web", query: "one more", requestedBy: "agent" }, ctx)).toThrow();
  });

  it("heartbeat upserts, online window is 30 min, prune requeues stale running tasks", () => {
    const data = buildSeedData();
    const r = heartbeatScoutRunner(data, { id: "pc-1", name: "PC", host: "h", version: "1.0.0", platforms: ["kijiji"] }, () => iso(NOW - 5 * MIN), "swept 3");
    expect(r.lastSummary).toBe("swept 3");
    expect(runnerOnline(r, NOW)).toBe(true);
    expect(runnerOnline(r, NOW + 40 * MIN)).toBe(false);
    heartbeatScoutRunner(data, { id: "pc-1", name: "PC renamed", host: "h", version: "1.0.1", platforms: ["kijiji", "web"] }, ctx.nowIso);
    expect(data.scoutRunners.length).toBe(1);
    expect(data.scoutRunners[0].name).toBe("PC renamed");

    const t = enqueueScoutTask(data, { platform: "kijiji", query: "stale scan", requestedBy: "agent" }, ctx).task;
    claimScoutTasks(data, "pc-1", [t.id], 5, () => iso(NOW - 3 * 60 * MIN));
    expect(t.status).toBe("running");
    const pruned = pruneScout(data, ctx.nowIso);
    expect(pruned.requeued).toBe(1);
    expect(t.status).toBe("queued");
    expect(t.claimedBy).toBeNull();

    const s = scoutStatus(data, NOW);
    expect(s.runners[0].online).toBe(true);
    expect(s.onlineRunners).toBe(1);
    expect(s.queued).toBe(1);
  });
});

describe("scoutRawLooksLikeDemand", () => {
  it("needs intent AND a trade BHC does", () => {
    expect(scoutRawLooksLikeDemand({ title: "Can anyone recommend a good Japanese restaurant?", body: "" })).toBe(false);
    expect(scoutRawLooksLikeDemand({ title: "Anyone recommend a roofer in Bedford?", body: "Shingles are curling, need a quote." })).toBe(true);
    expect(scoutRawLooksLikeDemand({ title: "Looking for someone to build a fence", body: "" })).toBe(true);
    expect(scoutRawLooksLikeDemand({ title: "September Painting", body: "We offer interior and exterior painting, free estimates" })).toBe(false);
    expect(scoutRawLooksLikeDemand({ title: "Vinyl siding for sale", body: "asking price $200" })).toBe(false);
  });
});

describe("ingestScoutResults", () => {
  it("keeps homeowner demand with real URLs, drops supply ads, dedupes", () => {
    const data = buildSeedData();
    const before = data.adListings.length;
    const r = ingestScoutResults(
      data,
      "kijiji",
      [
        { title: "Looking for siding contractor in Dartmouth", body: "Need quotes to replace vinyl siding.", url: "https://www.kijiji.ca/v-siding/city-of-halifax/looking-for-siding/1700000101" },
        { title: "We install siding — free estimates", body: "Licensed and insured, call us today", url: "https://www.kijiji.ca/v-siding/city-of-halifax/we-install/1700000102" },
        { title: "Need a deck built", body: "", url: "" },
        { title: "Looking for siding contractor in Dartmouth", body: "dupe", url: "https://www.kijiji.ca/v-siding/city-of-halifax/looking-for-siding/1700000101" },
      ],
      ctx,
    );
    expect(r.received).toBe(4);
    expect(r.created.length).toBe(1);
    expect(data.adListings.length).toBe(before + 1);
    expect(data.adListings[0].sourceId).toBe("adsrc-scout-kijiji");
    expect(data.adListings[0].location).toBeTruthy();
    const src = ensureScoutSource(data, "kijiji", ctx);
    expect(src.name).toMatch(/Lead scout/);
    expect(data.adSources.filter((s) => s.id === "adsrc-scout-kijiji").length).toBe(1);
  });
});

describe("parsers", () => {
  it("parses Reddit search JSON", () => {
    const json = {
      data: {
        children: [
          { data: { id: "abc123", title: "Looking for a deck builder in Sackville", selftext: "Anyone recommend someone?", permalink: "/r/halifax/comments/abc123/looking/", created_utc: 1757592000 } },
          { kind: "t3", data: { id: "def456", title: "no body", permalink: "/r/halifax/comments/def456/x/" } },
          { data: {} },
        ],
      },
    };
    const raws = parseRedditSearchJson(json);
    expect(raws.length).toBe(2);
    expect(raws[0].externalId).toBe("reddit:abc123");
    expect(raws[0].url).toMatch(/^https:\/\/www\.reddit\.com\/r\/halifax\/comments\/abc123\/looking\/?$/);
    expect(raws[0].postedAt).toMatch(/^2025-09-11/);
    expect(parseRedditSearchJson(null)).toEqual([]);
  });

  it("parses DuckDuckGo html results and unwraps redirects, keeping allowed domains only", () => {
    expect(unwrapDuckDuckGoHref("//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.kijiji.ca%2Fv-x%2Fa%2Fb%2F1700000001&rut=abc")).toBe("https://www.kijiji.ca/v-x/a/b/1700000001");
    const html = `
      <div class="result">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.kijiji.ca%2Fv-siding%2Fcity-of-halifax%2Flooking-for-siding%2F1700000001&amp;rut=x">Looking for siding contractor - Halifax</a>
        <a class="result__snippet" href="#">Need quotes for vinyl siding on a bungalow in Bedford.</a>
      </div>
      <div class="result">
        <a class="result__a" href="https://spam.example.com/page">Looking for siding</a>
        <a class="result__snippet" href="#">spam</a>
      </div>`;
    const raws = parseDuckDuckGoHtml(html, ["kijiji.ca"]);
    expect(raws.length).toBe(1);
    expect(raws[0].url).toMatch(/kijiji\.ca\/v-siding/);
    expect(raws[0].title).toMatch(/Looking for siding contractor/);
    expect(raws[0].body).toMatch(/Need quotes/);
  });

  it("parses Craigslist's no-JS static result list", () => {
    const html = `<ol class="cl-static-search-results">
      <li class="cl-static-search-result" title="Looking for someone to build a deck (Dartmouth)">
        <a href="https://www.craigslist.org/view/d/dartmouth-looking-for-deck/qNAi1T7TWcRsLd6c6By6ih">
          <div class="title">Looking for someone to build a deck (Dartmouth)</div>
          <div class="details"><div class="price">$0</div><div class="location"> Dartmouth </div></div>
        </a>
      </li>
      <li class="cl-static-search-result" title="dupe">
        <a href="https://www.craigslist.org/view/d/dartmouth-looking-for-deck/qNAi1T7TWcRsLd6c6By6ih"><div class="title">dupe</div></a>
      </li>
      <li class="cl-static-hub-links"><div>see also</div></li>
    </ol>`;
    const items = parseCraigslistStaticHtml(html);
    expect(items.length).toBe(1);
    expect(items[0].title).toMatch(/build a deck/);
    expect(items[0].location).toBe("Dartmouth");
    expect(items[0].url).toMatch(/craigslist\.org\/view\/d\/dartmouth-looking-for-deck/);
    expect(parseScoutResponse("craigslist", html).length).toBe(1);
    // Reddit Atom feeds parse too (search.rss path)
    const atom = `<feed><entry><title>Looking for a siding contractor</title><link href="https://www.reddit.com/r/halifax/comments/zz9/looking/"/><content>need quotes</content><id>t3_zz9</id></entry></feed>`;
    const rd = parseScoutResponse("reddit", atom);
    expect(rd.length).toBe(1);
    expect(rd[0].url).toMatch(/comments\/zz9/);
  });

  it("dispatches parseScoutResponse by platform", () => {
    const rss = `<rss><channel><item><title>Need someone to rebuild deck</title><link>https://halifax.craigslist.org/lab/d/need-deck/7700000001.html</link><description>Looking for quotes</description></item></channel></rss>`;
    const cl = parseScoutResponse("craigslist", rss, "https://halifax.craigslist.org/search/sss?format=rss");
    expect(cl.length).toBe(1);
    expect(cl[0].url).toMatch(/craigslist\.org\/lab\/d\/need-deck\/7700000001\.html/);
    const kijiji = `<html><body><a href="https://www.kijiji.ca/v-decks/city-of-halifax/need-a-deck-built/1700000002">Need a deck built</a></body></html>`;
    expect(parseScoutResponse("kijiji", kijiji, "https://www.kijiji.ca/b-services/x")[0].externalId).toBe("kijiji:1700000002");
  });
});

describe("runScoutQuery", () => {
  const sleep = async () => {};

  it("fetches each URL with the scout UA, filters to demand, dedupes", async () => {
    const calls: string[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push(url);
      expect(new Headers(init?.headers).get("user-agent")).toMatch(/BHC-LeadScout/);
      return new Response(
        `<rss><channel>
          <item><title>Looking for siding contractor</title><link>https://halifax.craigslist.org/lab/d/x/7700000001.html</link><description>need quotes</description></item>
          <item><title>We install siding free estimates</title><link>https://halifax.craigslist.org/bbb/d/y/7700000002.html</link><description>call us today</description></item>
          <item><title>Looking for siding contractor</title><link>https://halifax.craigslist.org/lab/d/x/7700000001.html</link><description>need quotes</description></item>
        </channel></rss>`,
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const r = await runScoutQuery("craigslist", "siding", { fetcher, sleep });
    expect(r.error).toBeNull();
    expect(r.blocked).toBe(false);
    expect(r.requests).toBe(2);
    expect(calls.length).toBe(2);
    expect(r.raws.length).toBe(1);
    expect(r.raws[0].url).toMatch(/7700000001\.html/);
  });

  it("marks 429 / 403 as blocked and never throws", async () => {
    const fetcher = (async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch;
    const r = await runScoutQuery("kijiji", "deck", { fetcher, sleep });
    expect(r.blocked).toBe(true);
    expect(r.error).toBeTruthy();
    expect(r.raws).toEqual([]);
    const boom = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const e = await runScoutQuery("reddit", "deck", { fetcher: boom, sleep });
    expect(e.blocked).toBe(false);
    expect(e.error).toMatch(/ECONNRESET/);
  });

  it("facebook has no fetch path here", async () => {
    let called = false;
    const fetcher = (async () => {
      called = true;
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await runScoutQuery("facebook", "deck", { fetcher, sleep });
    expect(called).toBe(false);
    expect(r.raws).toEqual([]);
  });
});
