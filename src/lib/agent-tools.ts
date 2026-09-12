/**
 * Agent-only tools for the autonomous Mainframe runtime.
 *
 * These sit next to the regular Mainframe CRM tools and give the unattended
 * agent its "hands on the web":
 *
 *   fetch_page        read a public listing / search page (allowlisted domains)
 *   ingest_ad         push a job request it found into the ad pipeline
 *   request_web_scan  ask the own-PC lead scout runner to scan a platform
 *   scout_status      runners online, scan queue, recent results
 *   last_tick_report  what the automation engine did/failed last tick
 *   set_goal / complete_goal / list_goals   persistent goals across runs
 *
 * Every tool is idempotent or deduped and never sends anything to a customer.
 */

import {
  ensureBuiltinSource,
  ingestRawAds,
  newAdSource,
  parseFetchedAdDocument,
  stripHtml,
  type RawAd,
} from "./ad-ingest";
import { qualifyListing } from "./ad-pipeline";
import type { AIToolDefinition } from "./ai-provider";
import { live } from "./events";
import { DEFAULT_AD_EXCLUDE_KEYWORDS, DEFAULT_DISCOVERY_DOMAINS } from "./lead-search-recipes";
import { enqueueScoutTask, parseScoutPlatform, scoutStatus, SCOUT_PLATFORMS } from "./lead-scout";
import type { ToolContext, ToolExecution } from "./mainframe-tools";
import { isJunkAdTitle, isRealContactEmail, isRealHttpUrl } from "./outreach-guard";
import type { AdSource, AppData, AssistantMemoryEntry } from "./types";

export const AGENT_TOOL_NAMES = [
  "fetch_page",
  "ingest_ad",
  "request_web_scan",
  "scout_status",
  "last_tick_report",
  "set_goal",
  "complete_goal",
  "list_goals",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

const AGENT_TOOL_SET = new Set<string>(AGENT_TOOL_NAMES);

export function isAgentTool(name: string): name is AgentToolName {
  return AGENT_TOOL_SET.has(name);
}

/** Agent tools that only read. */
export const AGENT_READ_TOOLS: readonly AgentToolName[] = [
  "fetch_page",
  "scout_status",
  "last_tick_report",
  "list_goals",
];

export const AGENT_SOURCE_ID = "adsrc-agent";
export const GOAL_TOPIC = "agent-goal";

export function buildAgentToolDefinitions(): AIToolDefinition[] {
  return [
    {
      name: "fetch_page",
      description:
        "Fetch a public web page (Kijiji, Craigslist, Reddit, Facebook, HomeStars, Nextdoor, search engines) and return its listings or readable text. Use to read a job ad, a search-results page, or a thread before ingesting it.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "https URL on an allowed domain" } },
        required: ["url"],
      },
    },
    {
      name: "ingest_ad",
      description:
        "Add a homeowner job request you found on the web to the ad pipeline (dedupes by URL, triages it, creates a lead + drafted reply when it qualifies). Requires the real listing URL. Never invent contacts.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string", description: "What the poster wants, in their words" },
          url: { type: "string", description: "Live https listing URL" },
          location: { type: "string" },
          contactEmail: { type: "string", description: "Only if visible on the page" },
          contactPhone: { type: "string", description: "Only if visible on the page" },
          postedAt: { type: "string", description: "ISO date if known" },
        },
        required: ["title", "url"],
      },
    },
    {
      name: "request_web_scan",
      description:
        "Queue a scan for the lead-scout runner (a browser/fetch worker on the owner's PC with a residential IP). Platforms: kijiji, craigslist, reddit, facebook, web. Results flow into the ad pipeline automatically.",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string", enum: [...SCOUT_PLATFORMS] },
          query: { type: "string", description: "Homeowner-intent search phrase, e.g. 'looking for siding contractor'" },
          region: { type: "string" },
          note: { type: "string", description: "Why you want this scan" },
        },
        required: ["platform", "query"],
      },
    },
    {
      name: "scout_status",
      description: "Lead scout runners (online/offline), queued/running scans, and the latest scan results.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "last_tick_report",
      description: "Results and errors from the most recent automation engine tick.",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "set_goal",
      description: "Record a standing goal to pursue on future runs (e.g. 'get 3 deck quotes out this week').",
      parameters: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
      },
    },
    {
      name: "complete_goal",
      description: "Mark a goal done by id or title.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" }, title: { type: "string" } },
      },
    },
    {
      name: "list_goals",
      description: "List open goals carried across runs.",
      parameters: { type: "object", properties: {} },
    },
  ];
}

/* ------------------------------ fetch gate ------------------------------ */

export function agentFetchDomains(): string[] {
  const raw = (process.env.AGENT_FETCH_DOMAINS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (raw.length) return raw;
  return [...DEFAULT_DISCOVERY_DOMAINS, "google.com", "bing.com", "duckduckgo.com"];
}

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|.*\.(internal|local|localdomain)$)/i;

/** Pure gate: https only, allowlisted public domains, never private/loopback hosts. */
export function isAgentFetchAllowed(
  url: string,
  allowed: string[] = agentFetchDomains(),
): { ok: boolean; reason?: string; host?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "only https URLs are allowed" };
  const host = parsed.hostname.toLowerCase();
  if (!host || PRIVATE_HOST_RE.test(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return { ok: false, reason: "private or numeric hosts are not allowed", host };
  }
  const okDomain = allowed.some((d) => host === d || host.endsWith(`.${d}`));
  if (!okDomain) return { ok: false, reason: `domain ${host} is not on the allowlist`, host };
  return { ok: true, host };
}

export const AGENT_FETCH_TEXT_CAP = 6000;

const FETCH_HEADERS = {
  "user-agent": "BHC-Mainframe/1.0 (+https://bhcontracting.ca)",
  accept: "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
  "accept-language": "en-CA,en;q=0.9",
} as const;

/**
 * Fetch with hop-by-hop allowlist checks. Never use redirect:"follow" —
 * an allowlisted host can 302 to a private/internal URL and SSRF the host.
 */
async function fetchPublicPage(
  url: string,
  fetcher: typeof fetch,
  timeoutMs = 15_000,
  maxHops = 5,
): Promise<{ ok: boolean; status: number; body: string; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let current = url;
    for (let hop = 0; hop < maxHops; hop++) {
      const gate = isAgentFetchAllowed(current);
      if (!gate.ok) {
        return { ok: false, status: 0, body: "", error: `redirect refused: ${gate.reason}` };
      }
      const res = await fetcher(current, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: { ...FETCH_HEADERS },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location")?.trim();
        if (!loc) {
          return { ok: false, status: res.status, body: "", error: `redirect ${res.status} with no Location` };
        }
        try {
          current = new URL(loc, current).toString();
        } catch {
          return { ok: false, status: res.status, body: "", error: "redirect Location is not a valid URL" };
        }
        continue;
      }
      const body = await res.text();
      return { ok: res.ok, status: res.status, body: body.slice(0, 2_000_000) };
    }
    return { ok: false, status: 0, body: "", error: `too many redirects (>${maxHops})` };
  } catch (err) {
    return { ok: false, status: 0, body: "", error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Turn a fetched page into what the model needs: listings when present, else readable text. */
export function summarizeFetchedPage(body: string, url: string): { summary: string; listings: RawAd[] } {
  const listings = parseFetchedAdDocument(body, url).filter((r) => r.title && isRealHttpUrl(r.url));
  if (listings.length) {
    const lines = listings.slice(0, 25).map((r) => {
      const bits = [r.title.slice(0, 90), r.url ?? ""];
      if (r.location) bits.push(r.location);
      if (r.postedAt) bits.push(r.postedAt.slice(0, 10));
      if (r.body) bits.push(r.body.replace(/\s+/g, " ").slice(0, 160));
      return `- ${bits.join(" · ")}`;
    });
    return {
      summary: `${listings.length} listing(s) on ${url}\n${lines.join("\n")}`,
      listings,
    };
  }
  const text = stripHtml(body).replace(/\s+/g, " ").trim();
  return {
    summary: text ? text.slice(0, AGENT_FETCH_TEXT_CAP) : "(page had no readable text)",
    listings: [],
  };
}

/* -------------------------------- goals --------------------------------- */

function goalEntries(data: AppData): AssistantMemoryEntry[] {
  return data.assistantMemory.filter((m) => m.topic === GOAL_TOPIC);
}

export function openAgentGoals(data: AppData): AssistantMemoryEntry[] {
  return goalEntries(data).filter((m) => !m.tags.includes("done"));
}

/* ------------------------------ execution ------------------------------- */

export type AgentToolDeps = {
  fetcher?: typeof fetch;
  /** false → heuristic triage only (tests) */
  ai?: boolean;
  now?: number;
};

function ensureAgentSource(data: AppData, ctx: ToolContext): AdSource {
  const existing = data.adSources.find((s) => s.id === AGENT_SOURCE_ID);
  if (existing) return existing;
  // Make sure the manual/webhook catch-alls exist too so admin filters stay consistent.
  ensureBuiltinSource(data, "manual", ctx);
  const src = newAdSource(
    {
      id: AGENT_SOURCE_ID,
      name: "Mainframe agent (web)",
      type: "manual",
      enabled: true,
      keywords: [],
      excludeKeywords: [...DEFAULT_AD_EXCLUDE_KEYWORDS],
      region: "Halifax Regional Municipality",
    },
    ctx,
  );
  data.adSources.push(src);
  return src;
}

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

export async function executeAgentTool(
  data: AppData,
  name: AgentToolName,
  args: Record<string, unknown>,
  ctx: ToolContext,
  deps: AgentToolDeps = {},
): Promise<ToolExecution> {
  switch (name) {
    case "fetch_page": {
      const url = str(args, "url");
      const gate = isAgentFetchAllowed(url);
      if (!gate.ok) return { ok: false, summary: `fetch_page refused: ${gate.reason}.` };
      const res = await fetchPublicPage(url, deps.fetcher ?? fetch);
      if (!res.ok) {
        return {
          ok: false,
          summary: `fetch_page failed: ${res.error ?? `HTTP ${res.status}`} for ${url}`,
        };
      }
      const { summary, listings } = summarizeFetchedPage(res.body, url);
      live.discovery(`Agent read ${gate.host}`, `${listings.length} listing(s) · ${url.slice(0, 80)}`);
      return { ok: true, summary, data: { listings: listings.slice(0, 25) } };
    }

    case "ingest_ad": {
      const title = str(args, "title");
      const url = str(args, "url");
      if (!title) return { ok: false, summary: "ingest_ad needs a title." };
      if (!isRealHttpUrl(url)) return { ok: false, summary: "ingest_ad needs the real https listing URL." };
      if (isJunkAdTitle(title)) return { ok: false, summary: "ingest_ad refused: title looks like a search digest, not a listing." };
      const email = str(args, "contactEmail");
      const raw: RawAd = {
        title: title.slice(0, 200),
        body: str(args, "body").slice(0, 4000),
        url,
        location: str(args, "location"),
        contactEmail: isRealContactEmail(email) ? email : "",
        contactPhone: str(args, "contactPhone"),
        postedAt: str(args, "postedAt") || ctx.nowIso(),
      };
      const source = ensureAgentSource(data, ctx);
      const created = ingestRawAds(data, source, [raw], ctx);
      if (!created.length) {
        const known = data.adListings.find((a) => a.url === url || a.url === raw.url);
        return {
          ok: true,
          summary: known
            ? `Already in the pipeline: "${known.title}" [${known.id}] status ${known.status}, score ${known.score}.`
            : "Listing was filtered out (real-estate / supply / excluded keywords).",
        };
      }
      const ad = created[0];
      const r = await qualifyListing(data, ad, {
        newId: ctx.newId,
        nowIso: ctx.nowIso,
        ai: deps.ai,
        now: deps.now,
      });
      live.ad(
        `${r.qualified ? "Qualified" : "Skipped"}: ${ad.title.slice(0, 80)}`,
        `Mainframe agent · score ${ad.score}${ad.location ? ` · ${ad.location}` : ""}`,
        { adId: ad.id, leadId: ad.leadId ?? undefined },
        r.qualified ? "success" : "info",
      );
      return {
        ok: true,
        summary: r.qualified
          ? `Ingested + qualified "${ad.title}" [${ad.id}] score ${ad.score} → lead ${r.lead?.id ?? "?"}, ${r.drafts.length} draft(s)${r.autoApproved ? ` (${r.autoApproved} auto-approved by policy)` : ""}.`
          : `Ingested "${ad.title}" [${ad.id}] but it did not qualify (score ${ad.score}: ${ad.reasons.slice(0, 2).join("; ") || "below threshold"}).`,
        data: { adId: ad.id, leadId: ad.leadId, qualified: r.qualified, score: ad.score },
      };
    }

    case "request_web_scan": {
      const platform = parseScoutPlatform(args.platform);
      const query = str(args, "query");
      if (!platform) return { ok: false, summary: `Unknown platform. Use one of: ${SCOUT_PLATFORMS.join(", ")}.` };
      if (query.length < 4) return { ok: false, summary: "request_web_scan needs a search phrase." };
      try {
        const r = enqueueScoutTask(
          data,
          {
            platform,
            query,
            region: str(args, "region") || undefined,
            requestedBy: ctx.authorId,
            note: str(args, "note") || undefined,
          },
          ctx,
        );
        const status = scoutStatus(data, deps.now);
        const runnerNote = status.onlineRunners
          ? `${status.onlineRunners} runner(s) online — it will pick this up within minutes.`
          : "No scout runner is online right now; the scan waits in the queue until one heartbeats in.";
        return {
          ok: true,
          summary: `${r.existing ? "Already queued" : "Queued"} ${platform} scan "${query}" [${r.task.id}]. ${runnerNote}`,
          data: { taskId: r.task.id, existing: r.existing },
        };
      } catch (err) {
        return { ok: false, summary: err instanceof Error ? err.message : String(err) };
      }
    }

    case "scout_status": {
      const s = scoutStatus(data, deps.now);
      const runners = s.runners.length
        ? s.runners
            .map((r) => `${r.name}@${r.host} ${r.online ? "ONLINE" : "offline"} (seen ${r.lastSeenAt.slice(0, 16)}, ${r.platforms.join("/")}, ${r.tasksDone} scans, ${r.adsPosted} ads)`)
            .join("; ")
        : "no runners have ever heartbeated — start one with `npm run scout -- --daemon` on a PC";
      const recent = s.recent
        .slice(0, 5)
        .map((t) => `${t.platform} "${t.query}" ${t.status}${t.status === "done" ? ` found ${t.found}, created ${t.created}` : t.error ? ` (${t.error.slice(0, 60)})` : ""}`)
        .join("; ");
      return {
        ok: true,
        summary: `Scout: ${s.onlineRunners} online of ${s.runners.length} runner(s) · ${s.queued} queued · ${s.running} running · ${s.doneToday} done today · ${s.failedToday} failed today. Runners: ${runners}. Recent: ${recent || "none"}.`,
        data: { queued: s.queued, running: s.running, onlineRunners: s.onlineRunners },
      };
    }

    case "last_tick_report": {
      const t = data.automationRuns[0];
      if (!t) return { ok: true, summary: "No engine tick recorded yet." };
      const lines = t.results.slice(0, 20).map((l) => `- ${l.slice(0, 160)}`);
      const errs = t.errors.slice(0, 10).map((e) => `- ERROR ${e.slice(0, 160)}`);
      return {
        ok: true,
        summary: `Tick ${t.finishedAt} (${t.source}, ${t.durationMs} ms): ${t.counters.automationsRun} automation(s), ${t.counters.tasksCreated} task(s), ${t.counters.notificationsCreated} alert(s).\n${[...errs, ...lines].join("\n") || "(quiet tick)"}`,
      };
    }

    case "set_goal": {
      const title = str(args, "title").slice(0, 240);
      if (!title) return { ok: false, summary: "set_goal needs a title." };
      const open = openAgentGoals(data);
      const dup = open.find((g) => g.content.toLowerCase() === title.toLowerCase());
      if (dup) return { ok: true, summary: `Goal already open [${dup.id}]: ${dup.content}` };
      if (open.length >= 20) return { ok: false, summary: "Too many open goals (20). Complete some first." };
      const entry: AssistantMemoryEntry = {
        id: ctx.newId(),
        topic: GOAL_TOPIC,
        content: title,
        tags: ["agent", "goal"],
        source: "agent",
        createdAt: ctx.nowIso(),
        authorId: ctx.authorId,
      };
      data.assistantMemory.unshift(entry);
      return { ok: true, summary: `Goal set [${entry.id}]: ${title}`, data: { id: entry.id } };
    }

    case "complete_goal": {
      const id = str(args, "id");
      const title = str(args, "title").toLowerCase();
      const goal = openAgentGoals(data).find(
        (g) => (id && g.id === id) || (title && g.content.toLowerCase().includes(title)),
      );
      if (!goal) return { ok: false, summary: "Open goal not found." };
      goal.tags = [...new Set([...goal.tags, "done"])];
      return { ok: true, summary: `Goal completed [${goal.id}]: ${goal.content}` };
    }

    case "list_goals": {
      const open = openAgentGoals(data);
      return {
        ok: true,
        summary: open.length
          ? open.map((g) => `[${g.id}] ${g.content} (since ${g.createdAt.slice(0, 10)})`).join("; ")
          : "No open goals.",
        data: { goals: open.map((g) => ({ id: g.id, title: g.content })) },
      };
    }

    default:
      return { ok: false, summary: `Unknown agent tool: ${String(name)}` };
  }
}
