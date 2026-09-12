import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_HARNESS_ALLOWED_TOOLS,
  AGENT_HARNESS_ALWAYS_DENIED,
  AGENT_HARNESS_DENIED_TOOLS,
  AGENT_HARNESS_FULL_TOOLS,
  AGENT_HARNESS_OPERATE_TOOLS,
  agentRuntimeStatus,
  assertHarnessAllowlistValid,
  agentHarnessEnvEnabled,
  buildAgentBriefing,
  buildHarnessTools,
  crmToolsForLevel,
  gateAgentHarnessTool,
  parseHarnessSections,
  runAgentOpsSweep,
} from "@/lib/agent-harness";
import { AGENT_TOOL_NAMES, executeAgentTool, isAgentFetchAllowed, openAgentGoals, summarizeFetchedPage } from "@/lib/agent-tools";
import { buildSeedData } from "@/lib/seed";
import type { AppData } from "@/lib/types";

const NOW = "2026-09-11T12:00:00.000Z";

afterEach(() => {
  delete process.env.AGENT_HARNESS_ENABLED;
  delete process.env.AGENT_AUTONOMY;
  delete process.env.AGENT_HARNESS_MAX_RUNS_PER_DAY;
  delete process.env.ADS_AUTOSEND_MIN_SCORE;
});

const okBudget = async () =>
  ({
    ok: true,
    day: { date: "2026-09-11", requests: 0, estimatedTokens: 0, byProvider: {}, byEmployee: {} },
    limits: { dailyRequests: 200, dailyTokens: 500_000, perEmployeeDaily: 80, maxSteps: 6, maxMessageChars: 12_000, maxHistoryMessages: 24 },
  }) as never;
const noopUsage = async () =>
  ({ date: "2026-09-11", requests: 1, estimatedTokens: 10, byProvider: {}, byEmployee: {} }) as never;

function deps(n = { v: 0 }) {
  return {
    newId: () => `id-${++n.v}`,
    nowIso: () => NOW,
    checkBudget: okBudget,
    recordUsage: noopUsage,
    tools: { ai: false as const },
  };
}

describe("agent harness allowlist", () => {
  it("every allowed tool exists on MAINFRAME_TOOL_NAMES", () => {
    expect(assertHarnessAllowlistValid()).toEqual([]);
  });

  it("refuses destructive / send / approve tools at the default (assist) tier", () => {
    for (const name of AGENT_HARNESS_DENIED_TOOLS) {
      const gate = gateAgentHarnessTool(name);
      expect(gate.allowed, name).toBe(false);
      expect(gate.summary).toMatch(/REFUSED/);
    }
  });

  it("allows read + reversible write tools", () => {
    for (const name of AGENT_HARNESS_ALLOWED_TOOLS) {
      expect(gateAgentHarnessTool(name).allowed, name).toBe(true);
    }
  });

  it("agent tools are allowed at assist and reads only at observe", () => {
    for (const name of AGENT_TOOL_NAMES) expect(gateAgentHarnessTool(name, "assist").allowed, name).toBe(true);
    expect(gateAgentHarnessTool("fetch_page", "observe").allowed).toBe(true);
    expect(gateAgentHarnessTool("scout_status", "observe").allowed).toBe(true);
    expect(gateAgentHarnessTool("ingest_ad", "observe").allowed).toBe(false);
    expect(gateAgentHarnessTool("request_web_scan", "observe").allowed).toBe(false);
    expect(gateAgentHarnessTool("create_task", "observe").allowed).toBe(false);
    expect(gateAgentHarnessTool("list_leads", "observe").allowed).toBe(true);
  });

  it("tiers widen monotonically and never include the always-denied set", () => {
    const observe = new Set(crmToolsForLevel("observe"));
    const assist = new Set(crmToolsForLevel("assist"));
    const operate = new Set(crmToolsForLevel("operate"));
    const full = new Set(crmToolsForLevel("full"));
    for (const t of observe) expect(assist.has(t), t).toBe(true);
    for (const t of assist) expect(operate.has(t), t).toBe(true);
    for (const t of operate) expect(full.has(t), t).toBe(true);
    for (const t of AGENT_HARNESS_OPERATE_TOOLS) expect(operate.has(t), t).toBe(true);
    for (const t of AGENT_HARNESS_FULL_TOOLS) expect(full.has(t), t).toBe(true);
    for (const d of AGENT_HARNESS_ALWAYS_DENIED) {
      expect(full.has(d as never), d).toBe(false);
      expect(gateAgentHarnessTool(d, "full").allowed, d).toBe(false);
      expect(gateAgentHarnessTool(d, "full").summary).toMatch(/never available/);
    }
  });

  it("full tier allows send_outreach; assist does not; env picks the tier", () => {
    expect(gateAgentHarnessTool("send_outreach", "full").allowed).toBe(true);
    expect(gateAgentHarnessTool("send_outreach", "operate").allowed).toBe(false);
    process.env.AGENT_AUTONOMY = "full";
    expect(gateAgentHarnessTool("send_outreach").allowed).toBe(true);
    process.env.AGENT_AUTONOMY = "observe";
    expect(gateAgentHarnessTool("create_task").allowed).toBe(false);
  });

  it("operate tier gates approve_outreach by ad score and forbids bulk approval", () => {
    const data = buildSeedData();
    data.adListings.unshift({
      id: "ad-hi",
      sourceId: "s",
      sourceName: "s",
      externalId: "x1",
      url: "https://www.kijiji.ca/v-a/b/c/1",
      title: "Need siding done",
      body: "",
      location: "Halifax",
      postedAt: null,
      fetchedAt: NOW,
      contactName: "",
      contactEmail: "",
      contactPhone: "",
      status: "drafted",
      score: 90,
      category: "siding",
      jobType: "residential",
      summary: "",
      reasons: [],
      classifiedBy: "local",
      leadId: null,
      outreachIds: ["out-hi"],
      repliedAt: null,
      notes: "",
    });
    data.adListings.unshift({ ...data.adListings[0], id: "ad-lo", externalId: "x2", url: "https://www.kijiji.ca/v-a/b/c/2", score: 40, outreachIds: ["out-lo"] });
    const base = {
      leadId: null,
      prospectName: "P",
      prospectEmail: "p@example.com",
      prospectPhone: "",
      channel: "email" as const,
      subject: "s",
      message: "m",
      status: "pending_approval" as const,
      workflowRunId: null,
      scheduledAt: NOW,
      sentAt: null,
      createdAt: NOW,
    };
    data.outreachQueue.unshift({ ...base, id: "out-hi", adId: "ad-hi" });
    data.outreachQueue.unshift({ ...base, id: "out-lo", adId: "ad-lo" });

    expect(gateAgentHarnessTool("approve_outreach", "operate", { all: true }, data).allowed).toBe(false);
    expect(gateAgentHarnessTool("approve_outreach", "operate", {}, data).allowed).toBe(false);
    expect(gateAgentHarnessTool("approve_outreach", "operate", { id: "out-hi" }, data).allowed).toBe(true);
    const lo = gateAgentHarnessTool("approve_outreach", "operate", { id: "out-lo" }, data);
    expect(lo.allowed).toBe(false);
    expect(lo.summary).toMatch(/score 40/);
    expect(gateAgentHarnessTool("approve_outreach", "operate", { id: "nope" }, data).allowed).toBe(false);
    // never hand-mark sent, never toggle itself
    expect(gateAgentHarnessTool("update_outreach", "operate", { id: "out-hi", status: "sent" }).allowed).toBe(false);
    expect(gateAgentHarnessTool("toggle_automation", "operate", { id: "auto-agent-ops" }).allowed).toBe(false);
    expect(gateAgentHarnessTool("toggle_automation", "operate", { id: "auto-pipeline" }).allowed).toBe(true);
  });

  it("builds real tool schemas for the tier", () => {
    const assist = buildHarnessTools("assist");
    const names = assist.map((t) => t.name);
    expect(names).toContain("create_task");
    expect(names).toContain("fetch_page");
    expect(names).toContain("request_web_scan");
    expect(names).not.toContain("send_outreach");
    expect(names).not.toContain("delete_lead");
    const listLeads = assist.find((t) => t.name === "list_leads")!;
    expect(Object.keys((listLeads.parameters as { properties: Record<string, unknown> }).properties ?? {}).length).toBeGreaterThan(0);
    expect(buildHarnessTools("full").map((t) => t.name)).toContain("send_outreach");
    expect(buildHarnessTools("observe").map((t) => t.name)).not.toContain("ingest_ad");
  });
});

describe("agentHarnessEnvEnabled", () => {
  it("defaults off", () => {
    delete process.env.AGENT_HARNESS_ENABLED;
    expect(agentHarnessEnvEnabled()).toBe(false);
  });

  it("turns on with 1/true", () => {
    process.env.AGENT_HARNESS_ENABLED = "1";
    expect(agentHarnessEnvEnabled()).toBe(true);
    process.env.AGENT_HARNESS_ENABLED = "true";
    expect(agentHarnessEnvEnabled()).toBe(true);
    process.env.AGENT_HARNESS_ENABLED = "0";
    expect(agentHarnessEnvEnabled()).toBe(false);
  });
});

describe("parseHarnessSections", () => {
  it("extracts DID / NEEDS HUMAN / NOTED bullets", () => {
    const reply = `Preamble.

## DID
- listed ads
- created task for stale lead

## NEEDS HUMAN
- approve outreach draft out-1
- send outreach to lead-9

## NOTED
- IMAP still disabled
`;
    const s = parseHarnessSections(reply);
    expect(s.did).toEqual(["listed ads", "created task for stale lead"]);
    expect(s.needsHuman).toEqual(["approve outreach draft out-1", "send outreach to lead-9"]);
    expect(s.noted).toEqual(["IMAP still disabled"]);
  });
});

describe("fetch gate", () => {
  it("allows https on allowlisted domains only and blocks private hosts", () => {
    expect(isAgentFetchAllowed("https://www.kijiji.ca/b-services/city-of-halifax/siding/k0c72l1700321").ok).toBe(true);
    expect(isAgentFetchAllowed("https://halifax.craigslist.org/search/sss?query=deck").ok).toBe(true);
    expect(isAgentFetchAllowed("http://www.kijiji.ca/").ok).toBe(false);
    expect(isAgentFetchAllowed("https://evil.example.com/").ok).toBe(false);
    expect(isAgentFetchAllowed("https://localhost/api/store").ok).toBe(false);
    expect(isAgentFetchAllowed("https://127.0.0.1/").ok).toBe(false);
    expect(isAgentFetchAllowed("https://10.0.0.5/").ok).toBe(false);
    expect(isAgentFetchAllowed("https://kijiji.ca.evil.com/").ok).toBe(false);
    expect(isAgentFetchAllowed("not a url").ok).toBe(false);
    expect(isAgentFetchAllowed("https://example.org/x", ["example.org"]).ok).toBe(true);
  });

  it("summarizes a Kijiji search page as listings and other pages as text", () => {
    const html = `<!DOCTYPE html><html><body>
      <a href="https://www.kijiji.ca/v-siding/city-of-halifax/looking-for-siding-contractor/1700000001">Looking for siding contractor in Bedford</a>
      <a href="https://www.kijiji.ca/v-decks/city-of-halifax/need-a-deck-built/1700000002">Need a deck built this fall</a>
    </body></html>`;
    const r = summarizeFetchedPage(html, "https://www.kijiji.ca/b-services/city-of-halifax/siding/k0c72l1700321");
    expect(r.listings.length).toBe(2);
    expect(r.summary).toMatch(/2 listing\(s\)/);
    const t = summarizeFetchedPage("<html><body><p>Hello <b>world</b></p></body></html>", "https://www.reddit.com/r/halifax/");
    expect(t.listings.length).toBe(0);
    expect(t.summary).toBe("Hello world");
  });
});

describe("agent tools", () => {
  const ctx = { authorId: "emp-mainframe-agent", newId: () => `t-${Math.random().toString(36).slice(2, 8)}`, nowIso: () => NOW };

  it("fetch_page uses the injected fetcher and refuses bad URLs", async () => {
    const data = buildSeedData();
    const fetcher = (async () => new Response("<html><body>Deck quotes wanted</body></html>", { status: 200 })) as unknown as typeof fetch;
    const ok = await executeAgentTool(data, "fetch_page", { url: "https://www.reddit.com/r/halifax/comments/abc/deck/" }, ctx, { fetcher });
    expect(ok.ok).toBe(true);
    expect(ok.summary).toMatch(/Deck quotes wanted/);
    const bad = await executeAgentTool(data, "fetch_page", { url: "https://internal.local/x" }, ctx, { fetcher });
    expect(bad.ok).toBe(false);
    expect(bad.summary).toMatch(/refused/);
  });

  it("fetch_page refuses redirects that leave the allowlist (SSRF)", async () => {
    const data = buildSeedData();
    const fetcher = (async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("reddit.com")) {
        return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/meta" } });
      }
      return new Response("should not fetch", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await executeAgentTool(
      data,
      "fetch_page",
      { url: "https://www.reddit.com/r/halifax/" },
      ctx,
      { fetcher },
    );
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/refused|private|redirect/i);
  });

  it("ingest_ad requires a real URL, dedupes, and flows through the pipeline", async () => {
    const data = buildSeedData();
    const before = data.adListings.length;
    const missing = await executeAgentTool(data, "ingest_ad", { title: "Need siding", body: "x" }, ctx, { ai: false });
    expect(missing.ok).toBe(false);
    const r = await executeAgentTool(
      data,
      "ingest_ad",
      {
        title: "Looking for siding contractor — Bedford",
        body: "Need vinyl siding replaced on a bungalow, looking for quotes this month.",
        url: "https://www.kijiji.ca/v-siding/city-of-halifax/looking-for-siding-contractor/1700000009",
        location: "Bedford",
      },
      ctx,
      { ai: false },
    );
    expect(r.ok).toBe(true);
    expect(data.adListings.length).toBe(before + 1);
    expect(data.adListings[0].sourceId).toBe("adsrc-agent");
    expect(data.adSources.some((s) => s.id === "adsrc-agent")).toBe(true);
    const again = await executeAgentTool(
      data,
      "ingest_ad",
      { title: "Looking for siding contractor — Bedford", url: "https://www.kijiji.ca/v-siding/city-of-halifax/looking-for-siding-contractor/1700000009" },
      ctx,
      { ai: false },
    );
    expect(again.ok).toBe(true);
    expect(again.summary).toMatch(/Already in the pipeline/);
    expect(data.adListings.length).toBe(before + 1);
  });

  it("request_web_scan queues once and reports runner availability", async () => {
    const data = buildSeedData();
    const a = await executeAgentTool(data, "request_web_scan", { platform: "kijiji", query: "looking for deck builder" }, ctx);
    expect(a.ok).toBe(true);
    expect(a.summary).toMatch(/Queued/);
    expect(a.summary).toMatch(/No scout runner is online/);
    const b = await executeAgentTool(data, "request_web_scan", { platform: "kijiji", query: "Looking for Deck Builder " }, ctx);
    expect(b.summary).toMatch(/Already queued/);
    expect(data.scoutTasks.filter((t) => t.status === "queued").length).toBe(1);
    const bad = await executeAgentTool(data, "request_web_scan", { platform: "tiktok", query: "x" }, ctx);
    expect(bad.ok).toBe(false);
  });

  it("goals persist in assistant memory and complete by id or title", async () => {
    const data = buildSeedData();
    const set = await executeAgentTool(data, "set_goal", { title: "Get 3 deck quotes out this week" }, ctx);
    expect(set.ok).toBe(true);
    expect(openAgentGoals(data).length).toBe(1);
    const dup = await executeAgentTool(data, "set_goal", { title: "get 3 deck quotes out this week" }, ctx);
    expect(dup.summary).toMatch(/already open/i);
    const list = await executeAgentTool(data, "list_goals", {}, ctx);
    expect(list.summary).toMatch(/deck quotes/);
    const done = await executeAgentTool(data, "complete_goal", { title: "deck quotes" }, ctx);
    expect(done.ok).toBe(true);
    expect(openAgentGoals(data).length).toBe(0);
  });

  it("scout_status and last_tick_report never throw on an empty store", async () => {
    const data = buildSeedData();
    expect((await executeAgentTool(data, "scout_status", {}, ctx)).ok).toBe(true);
    expect((await executeAgentTool(data, "last_tick_report", {}, ctx)).ok).toBe(true);
  });
});

describe("buildAgentBriefing", () => {
  it("summarizes pipeline, ops, last run, goals and scout without AI", () => {
    const data = buildSeedData();
    const text = buildAgentBriefing(data, { now: Date.parse(NOW), wakeReasons: ["2 prospect(s) replied"], level: "assist", trigger: "wake" });
    expect(text).toMatch(/Autonomy: ASSIST/);
    expect(text).toMatch(/Trigger: wake — 2 prospect\(s\) replied/);
    expect(text).toMatch(/Pipeline:/);
    expect(text).toMatch(/Lead scout:/);
    expect(text).toMatch(/first run/);
  });
});

describe("runAgentOpsSweep", () => {
  it("respects kill-switch without calling AI", async () => {
    process.env.AGENT_HARNESS_ENABLED = "0";
    const data = buildSeedData();
    let loopCalled = false;
    const r = await runAgentOpsSweep(data, {
      ...deps(),
      runLoop: async () => {
        loopCalled = true;
        return null;
      },
    });
    expect(r.skipped).toBe("kill_switch");
    expect(loopCalled).toBe(false);
    expect(data.agentRuns.length).toBe(0);
  });

  it("refuses denied tools inside the loop, records the run, and notifies owner", async () => {
    process.env.AGENT_HARNESS_ENABLED = "1";
    const data = buildSeedData();
    let sawBriefing = "";
    const r = await runAgentOpsSweep(
      data,
      {
        ...deps(),
        runLoop: async (input) => {
          sawBriefing = input.messages[0].content;
          expect(input.tools.map((t) => t.name)).toContain("fetch_page");
          await input.executeTool("send_outreach", { id: "out-1" });
          await input.executeTool("get_summary", {});
          await input.executeTool("set_goal", { title: "Keep pipeline full" });
          return {
            reply: ["## DID", "- get_summary", "", "## NEEDS HUMAN", "- send outreach out-1", "", "## NOTED", "- none"].join("\n"),
            toolRuns: [],
            webSearches: 2,
          };
        },
      },
      { trigger: "wake", wakeReasons: ["1 new qualified job ad(s)"] },
    );
    expect(r.ok).toBe(true);
    expect(sawBriefing).toMatch(/BRIEFING/);
    expect(sawBriefing).toMatch(/1 new qualified job ad/);
    expect(r.toolRuns.some((t) => t.tool === "send_outreach" && t.refused)).toBe(true);
    expect(r.needsHuman.length).toBeGreaterThan(0);
    expect(r.notifiedOwner).toBe(true);
    expect(data.notifications[0]?.title).toMatch(/needs human/i);
    expect(openAgentGoals(data).length).toBe(1);
    // run record persisted
    expect(data.agentRuns.length).toBe(1);
    const rec = data.agentRuns[0];
    expect(rec.trigger).toBe("wake");
    expect(rec.autonomy).toBe("assist");
    expect(rec.webSearches).toBe(2);
    expect(rec.did).toEqual(["get_summary"]);
    expect(rec.needsHuman[0]).toBe("send outreach out-1");
    expect(rec.toolRuns.length).toBe(3);
    expect(r.record?.id).toBe(rec.id);
    expect(data.assistantAudit[0].action).toBe("agent_ops");
  });

  it("stops at the daily run cap and records the skip", async () => {
    process.env.AGENT_HARNESS_ENABLED = "1";
    process.env.AGENT_HARNESS_MAX_RUNS_PER_DAY = "1";
    const data = buildSeedData();
    const d = deps();
    const first = await runAgentOpsSweep(data, {
      ...d,
      runLoop: async () => ({ reply: "## DID\n- none\n## NEEDS HUMAN\n- none\n## NOTED\n- quiet", toolRuns: [] }),
    });
    expect(first.ok).toBe(true);
    let called = false;
    const second = await runAgentOpsSweep(data, {
      ...d,
      runLoop: async () => {
        called = true;
        return null;
      },
    });
    expect(called).toBe(false);
    expect(second.skipped).toBe("run_cap");
    expect(data.agentRuns[0].skipped).toBe("run_cap");
    expect(data.agentRuns.length).toBe(2);
  });

  it("records a no_ai run when no provider answers", async () => {
    process.env.AGENT_HARNESS_ENABLED = "1";
    const data = buildSeedData();
    const r = await runAgentOpsSweep(data, { ...deps(), runLoop: async () => null });
    expect(r.skipped).toBe("no_ai");
    expect(data.agentRuns[0].skipped).toBe("no_ai");
  });

  it("full tier lets the loop call send_outreach", async () => {
    process.env.AGENT_HARNESS_ENABLED = "1";
    const data = buildSeedData();
    const r = await runAgentOpsSweep(data, {
      ...deps(),
      level: "full",
      runLoop: async (input) => {
        expect(input.tools.map((t) => t.name)).toContain("send_outreach");
        const res = await input.executeTool("send_outreach", { id: "nope" });
        expect(res.summary).not.toMatch(/REFUSED/);
        return { reply: "## DID\n- tried send\n## NEEDS HUMAN\n- none\n## NOTED\n- none", toolRuns: [] };
      },
    });
    expect(r.toolRuns[0].refused).toBeFalsy();
  });
});

describe("agentRuntimeStatus", () => {
  it("reports env, tier, cadence and counts", () => {
    process.env.AGENT_HARNESS_ENABLED = "1";
    process.env.AGENT_AUTONOMY = "operate";
    const data: AppData = buildSeedData();
    const s = agentRuntimeStatus(data, Date.parse(NOW));
    expect(s.envEnabled).toBe(true);
    expect(s.autonomy).toBe("operate");
    expect(s.runsToday).toBe(0);
    expect(s.maxRunsPerDay).toBe(48);
    expect(s.crmTools).toBeGreaterThan(s.agentTools);
    expect(s.lastRun).toBeNull();
  });
});
