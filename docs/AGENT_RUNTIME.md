# Autonomous agent runtime + lead scout

How the Mainframe agent runs BHC unattended, 24/7, and how it scrapes the web for
leads from its own PC. Code over doc when they drift.

```
                 ┌──────────────── Node host (next start) ────────────────┐
scheduler tick ──┤ runAutomationTick → agent_ops due? (interval OR wake)   │
  every 15 min   │   → runAgentOpsSweep (agent-harness.ts)                 │
                 │       briefing → Claude loop (CRM tools + agent tools    │
                 │       + web_search) → DID / NEEDS HUMAN / NOTED          │
                 │       → agentRuns record · audit · owner notification    │
                 └──────────────────────┬─────────────────────────────────┘
                                        │ request_web_scan → scoutTasks
                                        ▼
        ┌────────── own PC / any box: npm run scout -- --daemon ──────────┐
        │ heartbeat → claim tasks → Kijiji / Craigslist / Reddit / web    │
        │ (fetch) · Facebook Marketplace (Playwright + ops session)        │
        │ → POST /api/scout results → ad pipeline (dedupe → triage →      │
        │   lead → drafted reply) → agent wakes on the next tick          │
        └─────────────────────────────────────────────────────────────────┘
```

## 1. What the agent does every run

1. Reads a **server-built briefing** (pipeline counts, outreach queue, inbox, overdue
   tasks, unpaid invoices, last engine tick, last agent run, open goals, scout status,
   known listing URLs). No tool calls are wasted on orientation.
2. **Hunts leads**: `web_search` (Anthropic server tool, Halifax-located), `fetch_page`
   (public listing / search pages on allowlisted domains), `request_web_scan` (queues a
   platform scan for the scout runner), `ingest_ad` (pushes a real find through the
   normal ad pipeline: dedupe → triage → lead → drafted reply, autosend policy applies).
3. **Keeps ops current**: follow-up tasks, lead status updates, notes, goals.
4. Ends with `## DID`, `## NEEDS HUMAN`, `## NOTED`. NEEDS HUMAN items become an
   in-app notification (deduped per hour) and every run is stored in `data.agentRuns`.

Runs happen **on the interval** of the `auto-agent-ops` automation (store, default
60 min; `AGENT_HARNESS_INTERVAL_MIN` overrides) **or when woken** by:

| Wake reason | Source |
|-------------|--------|
| new qualified / drafted ads since the last run | `adListings.fetchedAt` |
| prospects replied | `adListings.repliedAt` |
| unread inbound SMS/email/voice | `messages` |
| outreach drafts waiting for approval | `outreachQueue` |
| last engine tick had errors | `automationRuns[0]` |
| scout scans finished | `scoutTasks.completedAt` |

Wakes respect `AGENT_HARNESS_MIN_GAP_MIN` (default 10) and the daily cap
`AGENT_HARNESS_MAX_RUNS_PER_DAY` (default 48). Logic: `src/lib/agent-wake.ts`.

## 2. Autonomy tiers (`AGENT_AUTONOMY`)

| Tier | May do | Still NEEDS HUMAN |
|------|--------|-------------------|
| `observe` | read CRM, read the web (`fetch_page`, `web_search`), `scout_status`, `last_tick_report`, `list_goals` | every write |
| `assist` (default) | + create/update leads, jobs, deals, tickets, tasks, notes; `ingest_ad`; `request_web_scan`; goals; `hunt_leads` | approvals, sends, config |
| `operate` | + `approve_outreach` **one draft at a time, only when the ad scores ≥ `ADS_AUTOSEND_MIN_SCORE`**; `update_outreach` (never status=sent); `run_workflow`; `process_sequences`; `save_criteria_profile`; `toggle_automation` (not itself) | real sends, invoices |
| `full` | + `send_outreach` (opt-outs, daily cap, quiet hours still enforced by `outreach-send.ts`), `update_invoice`, `register_contract`, `sync_contract` | deletes, HR, imports, accounting |

Refused at **every** tier: all `delete_*`, `create_employee`, `update_employee`,
`import_data`, `purge_synthetic_outreach`, `delete_memory`, `run_daily_automations`,
`qb_sync_*`. The gate is code (`gateAgentHarnessTool`), not the prompt.

Kill-switches: `AGENT_HARNESS_ENABLED=0` (hard) and the `auto-agent-ops` toggle in
Admin → Automation. Budget: `AI_DAILY_*` limits under actor `emp-mainframe-agent`,
`AGENT_HARNESS_MAX_STEPS` (default 12, max 40), `AGENT_WEB_SEARCH_MAX` (default 5).

## 3. Lead scout — scraping from its own PC

Cloud IPs get 403/429 from Kijiji/Reddit/Craigslist and Facebook needs a logged-in
session, so the scraper is a **runner process** that lives wherever a residential IP
and (optionally) an ops Facebook session exist — normally the owner's PC. It never
needs inbound ports: it polls the CRM.

```bash
# .env on that PC (never commit)
BHC_BASE_URL=https://bhcontracting.ca
ADS_INBOUND_SECRET=<same value as the server>
SCOUT_RUNNER_NAME=Office PC
# optional: FB_SESSION_STATE=C:\bhc-secrets\fb-session.json  (created once with --login)

npm run scout -- --once --dry-run     # see what it would post
npm run scout -- --daemon             # 24/7
npm run scout -- --login              # one-time Facebook ops login → session file
```

| Platform | How | Notes |
|----------|-----|-------|
| kijiji | HTML search (`buildKijijiServicesUrl`) → `parseKijijiSearchHtml`; long phrases fall back to bare trade terms (Kijiji ANDs every word) | works from residential IPs |
| craigslist | `search/sss` + `search/ggg` pages → no-JS `cl-static-search-result` list (`parseCraigslistStaticHtml`); RSS was retired by Craigslist in 2023 | |
| reddit | `r/halifax/search.rss` → `parseFeed` (`search.json` answers 403 to non-browser clients) | |
| web | DuckDuckGo HTML → links on kijiji/craigslist/reddit/facebook/homestars/nextdoor | generic catch-all |
| facebook | Playwright + saved ops session → Marketplace search | only when `FB_SESSION_STATE` set |

Each cycle (`SCOUT_INTERVAL_MIN`, default 10): heartbeat → claim queued tasks →
run → `POST /api/scout {action:"results"}` (server re-applies the demand filter, dedupes,
triages up to 10 per post) → complete → default demand sweep every `SCOUT_SWEEP_MIN`
(30). 403/429 pauses that platform for an hour. Local state (`data/scout-state.json`)
keeps seen ids so the server is not spammed. Polite delays, one UA
(`BHC-LeadScout/1.0`), no login automation, no captcha solving.

Install as a service:

- **Windows** (PowerShell, as the logged-in user):
  `powershell -ExecutionPolicy Bypass -File deploy/windows/install-lead-scout.ps1`
  registers Scheduled Task "BHC Lead Scout" at logon with auto-restart. `-Uninstall` removes it.
- **Linux**: `deploy/production/bhc-lead-scout.service` (Restart=always).

Everything the runner posts lands as ad sources `adsrc-scout-<platform>` in Admin → Ads;
the agent's own finds land under `adsrc-agent`. Both feed the same lead + draft flow
and the same `OUTREACH_AUTOSEND` policy.

## 4. API

`GET /api/automation` now includes `agent` (runtime status), `agentRuns`, `scout`.
`POST /api/automation` adds `{action:"agent_run"}` and `{action:"scout_enqueue", platform, query}`.

`/api/scout` (public prefix; auth inside — `x-bhc-inbound-secret` = `ADS_INBOUND_SECRET`,
or admin/manager session):
`GET ?runner=<id>` → queued tasks + defaults; `POST` actions `heartbeat`, `claim`,
`complete`, `results`, `enqueue`.

## 5. Console / CLI

```bash
npm run bhc -- agent status | run | goals
npm run bhc -- scout status | enqueue kijiji "looking for siding contractor"
npm run scout -- --daemon | --once | --dry-run | --platforms kijiji,reddit | --login
```

## 6. Turning it on in production

1. `/etc/bhc/bhc.env` + `/opt/bhc/.env`: `AGENT_HARNESS_ENABLED=1`, `AGENT_AUTONOMY=assist`
   (raise to `operate` once you trust the approvals), optional `AGENT_HARNESS_INTERVAL_MIN=30`.
2. Admin → Automation → enable **Mainframe ops sweep (AI agent)**; press **Run agent now**
   and read DID / NEEDS HUMAN / NOTED.
3. On the PC that should scrape: set `BHC_BASE_URL`, `ADS_INBOUND_SECRET`, run the installer.
   Admin → Automation → **Lead scout** shows it online within a minute.
4. Watch `/admin/live` and `/admin/ads`. Every send still obeys `OUTREACH_AUTOSEND`,
   `ADS_AUTOSEND_MIN_SCORE`, `OUTREACH_DAILY_CAP`, quiet hours, and opt-outs.

## 7. Files

`src/lib/agent-harness.ts` (tiers, gate, briefing, sweep, status) · `agent-tools.ts`
(fetch_page, ingest_ad, request_web_scan, scout_status, last_tick_report, goals) ·
`agent-wake.ts` (wake reasons, cadence knobs) · `lead-scout.ts` (tasks, runners, ingest) ·
`scout-platforms.ts` (adapters, `runScoutQuery`) · `scripts/lead-scout.ts` (runner) ·
`src/app/api/scout/route.ts` · `ai-provider.ts` (`serverTools`, `webSearches`) ·
`automation-engine.ts` (`agentOpsDue`) · tests: `tests/agent-harness`, `agent-wake`, `lead-scout`.
