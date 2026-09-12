# Agent memory — BHC project context

Persistent log of user preferences, decisions, and chat themes for future agents and engineers.  
**Last updated:** 2026-09-05

## How to use this file

- Read this before large UI or product changes.
- Append dated entries when the user states a preference or you ship a major decision.
- Do not store secrets (API keys, PINs beyond public demo accounts).

---

## User preferences (stable)

| Topic | Preference |
|-------|------------|
| Git | Feature branches `cursor/<kebab>-22fe`; merge verified PRs to `main` |
| Demo login | `cameron` / `1001` (admin) — not `jordan` |
| Public demo | GitHub Pages at `/BHC` — use `withBasePath()` for fetch/SW only, not Next `Link` |
| AI keys | Never commit; browser key in sidebar for Pages testing only |
| Outreach | Always `pending_approval` until real SMTP |
| Testing | User expects evidence (tests + UI walkthrough) before calling work done |

---

## Product decisions (chronological)

### Public site & rebrand

- Seaside Contracting UI ported 1:1 and rebranded **BH Contracting Co.**
- Fixed dark-hero nav/CTA contrast, manifest, hero layering.
- Staff entry via **Staff login** on gate + header → `/login`.

### Auth & store

- Login migrated from `jordan` → `cameron`; storage keys bumped (`bhc-auth-*`, `bhc-crm-store-v8`).
- `?next=` redirect supported after login.
- Single JSON store (`data/store.json`) + localStorage mirror for static demo.

### CLI & server AI (merged PR #5)

- `npm run bhc -- ai status|chat|summarize`, `store summary`, `automations …`
- Gemini preferred, OpenAI fallback, local parser fallback.
- Mainframe tool schemas expanded; `GET /api/ai/status`.

### Client AI & Active Knocker base (merged PR #6)

- `src/lib/ai-client.ts`, `AiKeyPanel` on `/admin/assistant`.
- Knocker command center, Leaflet map, `/apps/knocker`, `/admin/knocker`.
- Geo utils: RDP, PIP, cluster, route; store **v8**.

### Production knocker + docs (merged PR #7)

- Calendar: ICS + Google template + `GET /api/calendar`.
- Push: Notification API, `public/sw.js`, due-task reminders.
- Signatures: `SignaturePad` on Propose tab.
- GPS: distance filter, accuracy, wake lock, battery backoff.
- Webhooks: HMAC `X-BHC-Signature`, delivery log.
- Full doc set: `CLAUDE.md`, `docs/HANDOFF`, `ARCHITECTURE`, `API`, `DEPLOYMENT`, `USAGE`, `KNOCKER`, `AI`.

### JARVIS intelligence UI (2026-08-24)

**User feedback:** Bar felt “dead” — dots highlighted but no insight; animations felt random.

**Shipped behavior:**

- Live **metric chips** (pipeline $, doors today, open shifts, alerts) above the bar.
- **Expandable detail panel** on bar click or dot select: breakdown rows, entity list, primary/secondary actions.
- Richer `buildJarvisInsights()` from full `AppData`: knocker todos, proposals, notifications, automations due, urgent tickets, pinned announcements.
- Tone-colored orb + category chips; rotation pauses on hover/expand; typing only when collapsed.
- CSS cleanup: removed duplicate rules, dropped global `.jarvis-content > *` fade, slower border gradient, `prefers-reduced-motion` support.
- **HUD deck strip:** compact `JarvisBar variant="hud"` sits above the radial dock on `/admin/dashboard` (expand panel grows upward; no typewriter).
- Metric chips and pipeline graph nodes expand the matching briefing card; action buttons in the panel still navigate.

**Key files:** `src/lib/jarvis-briefing.ts`, `src/components/JarvisBar.tsx`, `src/components/JarvisDetailPanel.tsx`, `src/app/admin/dashboard/page.tsx`, `src/app/globals.css` (JARVIS + HUD blocks).

### Automation supercharge (2026-09-05, Claude)

**User ask:** "supercharge this project and set it up to automate as many tasks as possible on top of the current system." Production is live at bhcontracting.ca; the user runs the deploy themselves.

**Shipped:**

- Automation engine (`src/lib/automation-engine.ts`) + in-process scheduler started from `src/instrumentation.ts` (every 15 min, `BHC_SCHEDULER=0` to disable). 14-entry catalog: reminders, invoice follow-up, job health, inventory reorder, tool overdue, damage escalation, fleet check, daily digest, sequences, webhook retry, nightly backup, pipeline scan (+ prospect hunt / outreach digest off by default). Idempotent via `dedupeKey` + open-task lookups.
- Workflow engine: 7 new triggers (job created/status, invoice status, proposal signed, damage, ticket, scheduled) and 5 new actions (notification, webhook, job from lead, invoice draft, lead status). Four templates ship **paused**.
- Webhooks: pending queue, exponential backoff retry (max 5), `X-BHC-Delivery` / `X-BHC-Attempt`, 9 new events.
- `/admin/automation` hub (Administration nav), `/api/automation`, public `/api/health`, JARVIS "Automation" chip + card, Mainframe tools `automation_status` / `toggle_automation` / `store_health`.
- Backups (`data/backups/`, rotating) + store integrity report; CLI `automations tick|status`, `store health|backup|backups|restore`, `webhooks backlog|retry`.
- CI/CD: `.github/workflows/ci.yml` (lint/typecheck/test/build), `deploy-production.yml` (SSH deploy after CI, gated on secrets), `nightly.yml`, `gh-pages.yml` (manual), Dependabot. Host script `deploy/production/deploy.sh` with pre-deploy snapshot, health gate, auto-rollback; workstation `npm run release`.
- Store key bumped to **v10** (`automationRuns` collection).

**Decisions:** additive-only migrations; anything that creates business records ships disabled; nothing sends customer email. Node 22 is required to run vitest 4 locally (Node 21 fails on `util.styleText`).

### Job-ad outreach + console (2026-09-06, Claude)

**User ask (verbatim theme):** "one of the main automations i want setup is cold emailing/cold texting responding to ads for possible jobs in the area and whatever model i need to buy or setup"; then "create an intuitive command line interface console… configure any webhooks we would need… i will get the necessary api keys"; then "review the entire project and improve… including the jarvis panel… tell me what models and webhooks i need to configure".

**Shipped:**

- Ad pipeline: RSS + alert-mailbox (IMAP via `imapflow`/`mailparser`) + inbound webhook + manual paste → dedupe → Claude Haiku triage (rules fallback) → lead + Claude Opus reply drafts (email/SMS/platform) → approval-gated send (SMTP/Resend, Twilio) → one follow-up → auto-close. Replies via Twilio inbound webhook and mailbox polling; STOP/"no thanks" → `optOuts` enforced before every send.
- `/admin/ads` page, `/api/ads`, `/api/ads/inbound`, `/api/sms/inbound`, `/api/outreach` real send, `/api/webhooks` presets + formats (slack/discord/json) + test.
- `npm run console` — REPL for everything (leads/jobs/invoices/ads/outreach/auto/hooks/backups, free text → Mainframe).
- JARVIS: "Job-ad outreach" chip + card; Mainframe tools `list_ads`, `outreach_status`.
- Autonomy: lead → contacted on send; ads auto-close after 21 days; daily digest email (`DIGEST_EMAIL_TO`).
- Model defaults moved to `claude-opus-5` (main) + `claude-haiku-4-5` (triage); `temperature` omitted on 4.6+ models.

**Shopping list for the owner:** Anthropic API key; a `quotes@` GoDaddy mailbox (IMAP + SMTP); Kijiji saved-search alerts to that mailbox; Twilio account + 902 number with inbound webhook → `/api/sms/inbound`; optional Slack/Discord webhook URL; optional Zapier for `/api/ads/inbound`. Full detail `docs/OUTREACH.md`.

### Platform + job hub + inbox (2026-09-06, Claude, "free reign" round)

**User ask:** "lets build all that … tools to generate contracts, invoices, job reports and tie it all to the individual job … centralize every single system … everything automatically sent to the customer … build all 5 suggestions … work on the UI … live data stream of the system pinging out into the internet searching for info and leads and doing outreach live … compile a list of what ai models i need."

**Shipped:**

- **Live wire**: `src/lib/events.ts` ring buffer + JSONL sink, `/api/stream` SSE, `LiveWire` component on the dashboard (HUD + classic) and `/admin/live`. Every subsystem emits.
- **Auth**: signed httpOnly cookie sessions, lockout, `src/middleware.ts` gate on `/api/*` with public allowlist; legacy header transitional (`BHC_STRICT_AUTH`).
- **Storage**: `store-backend.ts` (json | sqlite via `node:sqlite`, `process.getBuiltinModule`), `media-store.ts` (photos/signatures/PDFs on disk, nightly `media_offload`).
- **Job hub** `/admin/jobs/[id]`: checklist, quotes editor + catalog, e-sign at `/q/<token>` → job + deposit invoice + contract + PDFs, invoices with Stripe/e-Transfer, payments, documents, site updates, messages, timeline. Public `/pay/<token>`, `/portal/<token>`, `/r/<code>`.
- **Documents** (`pdfkit`): quote, contract, invoice, receipt, job report; `deliver.ts` emails PDF + SMS link; `DOCS_AUTOSEND` policy; weekly `job_reports` automation.
- **Payments**: Stripe Checkout + signed webhook, manual records, Interac e-Transfer auto-match from mailbox, `payment_reminders` 7/14/30d, receipts.
- **Reviews/referrals**: `review_requests`, `referral_asks` automations; referral codes on leads.
- **Inbox** `/admin/inbox` + `messaging.ts`: SMS/email/voice threads, Claude-drafted replies, unknown numbers → leads; Twilio Voice forward → voicemail transcription (Claude summary) → missed-call text-back.
- **Internet lead discovery**: `lead-discovery.ts` — Claude Opus 5 + `web_search_20260209` every 3h → ad inbox.
- Console: `inbox`, `quote`, `docs`, `pay`. JARVIS: inbox + receivables cards, inbox chip. `docs/SETUP_CHECKLIST.md` = the models/services/webhooks list.

**Gotchas learned:** `src/middleware.ts` makes Next compile `instrumentation.ts` for Edge too → Node-only libs must be dynamically imported in `scheduler.ts` and Node core modules are stubbed for `nextRuntime === "edge"` in `next.config.ts`; `node:sqlite` must be loaded via `process.getBuiltinModule`. Claude 4.6+ models reject `temperature`.

### Tutorials walkthrough (2026-08-24)

**User request:** Full tutorials page covering every aspect of the system with role-based access.

**Shipped:**
- `src/lib/tutorials.ts` — modules + ordered role paths for admin/manager/sales/knocker/field/office/driver
- `/admin/tutorials` + `/apps/tutorials` — interactive guide with role preview, start-here path, search, permission cheat sheet
- Nav: Administration → Tutorials (`board` so every role can open it); Field hub card

---

### Autonomous agent runtime + lead scout (2026-09-11, Claude)

**User request (`/goal`):** make the Mainframe agent harness a fully autonomous agent that runs 24/7, can automate the whole system, and scrapes the web for leads across many platforms from its own PC. (A mid-session "/orchestration … auth refactor" message was meant for Cursor, not this session.)

**Shipped:**
- Store **v11**: `agentRuns`, `scoutTasks`, `scoutRunners` (additive; `normalizeStore` fills `[]`).
- `agent-harness.ts` rewritten: autonomy tiers (`AGENT_AUTONOMY` observe/assist/operate/full; deletes/HR/imports/QB-sync refused everywhere; approve gated by ad score), server-built briefing, real tool schemas, Anthropic `web_search` server tool (`serverTools` in `ai-provider.ts`), run records, daily run cap, `agentRuntimeStatus`.
- `agent-tools.ts`: `fetch_page` (https + domain allowlist + private-host block), `ingest_ad` (→ `adsrc-agent` → pipeline), `request_web_scan`, `scout_status`, `last_tick_report`, `set_goal`/`complete_goal`/`list_goals` (memory topic `agent-goal`).
- `agent-wake.ts` + engine: agent_ops runs on interval **or wakes** on new qualified ads / replies / inbound messages / tick errors / finished scans, min gap `AGENT_HARNESS_MIN_GAP_MIN`, `AGENT_HARNESS_INTERVAL_MIN` override.
- Lead scout: `lead-scout.ts` (tasks, runners, ingest), `scout-platforms.ts` (kijiji/craigslist/reddit/web adapters, 403/429 → blocked), `scripts/lead-scout.ts` (`npm run scout -- --daemon|--once|--dry-run|--login`), `/api/scout`, Windows Scheduled Task installer + systemd unit.
- UI: Admin → Automation gains "Autonomous agent" (status, wake reasons, Run agent now, run history with DID/NEEDS HUMAN/NOTED) and "Lead scout (your PC)" (runners, queue, queue-a-scan, setup hint). CLI `agent status|run|goals`, `scout status|enqueue`.
- Docs: `docs/AGENT_RUNTIME.md`, `.env.example`, CLAUDE.md. Tests: `agent-harness`, `agent-wake`, `lead-scout`.

**Owner preferences reaffirmed:** owner runs the deploy; anything that sends stays behind policy; additive migrations only.

---

## Chat themes (for continuity)

1. **Make the app feel alive** — user wants data surfaced in UI, not buried in store/API.
2. **Knocker parity with Active Knocker** — map, turfs, GPS, routes, chat, leaderboard, proposals.
3. **AI everywhere but safe** — Mainframe + CLI + optional browser Gemini; no auto-send outreach.
4. **Transfer-friendly docs** — every major area documented for handoff to Claude/other agents.

---

## Known backlog (do not re-discover)

1. Postgres / object storage for photos and scale.
2. GoDaddy SMTP for real outreach send.
3. Google Calendar OAuth (`events.insert`).
4. Web Push VAPID for cross-device push.
5. Capacitor/native wrap for background GPS.
6. httpOnly session cookies + PIN lockout.
7. Multi-tenant stores.

---

## Verification checklist (default)

```bash
npm test
npm run lint
npm run build
```

Manual: login `cameron`/`1001` → surface under change (e.g. `/admin/sales`, `/apps/knocker`, JARVIS expand on dashboard).

---

## Demo URLs & accounts

| Resource | Value |
|----------|--------|
| Pages demo | https://gemsns.github.io/BHC/ |
| Admin | `cameron` / `1001` |
| Knocker | `jamie` / `1007` |
| Field | `sam` / `1003` |
| Driver | `riley` / `1005` |
