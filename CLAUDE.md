# CLAUDE.md — BH Contracting Co. (BHC) development transfer

This file is the primary briefing for a successor agent (Claude or otherwise). Read it first, then `docs/HANDOFF.md` and the rest of `docs/`.

## What this product is

**BHC** is a Next.js 15 all-in-one ops CRM + field PWA for **BH Contracting Co.** (subcontracting). It includes:

- Public marketing site (Seaside-contracting 1:1 port, rebranded BH)
- Staff CRM (leads, jobs, invoices, schedule, inventory, fleet)
- **Active Knocker** field canvassing (map, turfs, GPS, proposals, calendar, webhooks)
- **Mainframe AI** (Anthropic Claude preferred → Gemini → OpenAI → local parser)
- GitHub Pages static demo + full API mode with JSON file store

Repo: `GemsNS/BHC` · Live static demo: `https://gemsns.github.io/BHC/` · Package manager: **npm**.

## Non-negotiables

1. **Do not commit secrets.** `.env` is gitignored. Never put Gemini/OpenAI keys in git. `NEXT_PUBLIC_GEMINI_API_KEY` is **temporary Pages testing only**.
2. **Demo admin login is `cameron` / `1001`** (not jordan). `src/lib/normalize.ts` migrates old stores.
3. **Bump `bhc-crm-store-vN` in `src/lib/client-data.ts` when `AppData` schema changes.** Current: **v10**.
4. **Do not pass `withBasePath()` to Next `Link` / `router.push`.** Next applies `basePath`. Use `withBasePath` for `fetch` and service-worker URLs only.
5. **GitHub Pages builds strip `src/app/api`.** Static demo uses localStorage. Full AI/webhooks/calendar ICS need server mode (`npm run dev` / `npm start`).
6. **User preference:** merge verified feature PRs into `main`. Branch names: `cursor/<name>-22fe`.
7. **Do not put `next dev` in install/update scripts.**

## Quick commands

```bash
npm install
npm run dev          # 0.0.0.0:3000
npm test
npm run lint
npm run build
npm run bhc -- ai status
npm run bhc -- store summary
npm run deploy:gh-pages
```

## Where to look

| Need | Path |
|------|------|
| Types / store shape | `src/lib/types.ts` (`AppData`) |
| Seed + migrations | `src/lib/seed.ts`, `src/lib/normalize.ts`, `src/lib/store.ts` |
| Auth / roles | `src/lib/session.tsx`, `ROLE_PERMISSIONS` in types |
| Knocker map/UI | `src/components/knocker/*`, `/apps/knocker`, `/admin/knocker` |
| Knocker API | `src/app/api/knocker/route.ts` |
| Calendar ICS | `src/lib/calendar.ts`, `GET /api/calendar` |
| Webhooks (signed, queued, retried) | `src/lib/webhooks.ts`, `/api/webhooks` |
| **Automation engine** | `src/lib/automation-engine.ts`, `automation-checks.ts`, `automation-defaults.ts`, `scheduler.ts`, `src/instrumentation.ts`, `/admin/automation`, `/api/automation`, `docs/AUTOMATION.md` |
| Event workflows | `src/lib/workflows.ts` (11 triggers, 13 actions) |
| **Job-ad outreach (cold email/SMS)** | `src/lib/ad-ingest.ts`, `ad-imap.ts`, `ad-classify.ts`, `ad-pipeline.ts`, `outreach-send.ts`, `sms.ts`, `/admin/ads`, `/api/ads`, `/api/sms/inbound`, `docs/OUTREACH.md` |
| Console (interactive CLI) | `scripts/bhc-console.ts` → `npm run console` |
| **Job hub** (quotes, contracts, invoices, reports, payments, messages per job) | `/admin/jobs/[id]`, `src/lib/job-hub.ts`, `quotes.ts`, `documents.ts` (pdfkit), `deliver.ts`, `payments.ts` (Stripe), `numbering.ts`, `customer-touches.ts` |
| Customer-facing pages | `/q/[token]` sign quote · `/pay/[token]` invoice + Stripe · `/portal/[token]` job portal · `/r/[code]` referral form (`src/app/api/public/*`) |
| Inbox + voice | `src/lib/messaging.ts`, `/admin/inbox`, `/api/messages`, `/api/sms/inbound`, `/api/voice/*` (Twilio), `twilio-verify.ts` |
| Live wire (real-time feed) | `src/lib/events.ts`, `events-server.ts`, `/api/stream` (SSE), `components/LiveWire.tsx`, `/admin/live` |
| Auth (cookies, lockout) | `src/lib/auth-session.ts`, `src/middleware.ts`, `/api/auth/login|logout` |
| Storage | `src/lib/store-backend.ts` (json / sqlite via `BHC_STORE`), `media-store.ts` (photos + PDFs on disk, `/api/media/*`) |
| Internet lead discovery | `src/lib/lead-discovery.ts` (Claude + web search) |
| Setup checklist (models, services, webhooks) | `docs/SETUP_CHECKLIST.md` |
| Backups / health | `src/lib/store-backup.ts`, `store-health.ts`, `GET /api/health` |
| Deploy | `deploy/production/deploy.sh` (host), `scripts/release.sh` (workstation), `.github/workflows/*` |
| GPS | `src/lib/gps-tracker.ts` |
| AI | `src/lib/ai-provider.ts`, `src/lib/ai-client.ts`, `src/lib/mainframe-agent.ts` |
| CLI | `scripts/bhc-cli.ts` |
| Nav | `src/lib/nav.ts` |
| Docs | `docs/` |

## Automation (read `docs/AUTOMATION.md`)

- The Node host runs an **in-process scheduler** (`BHC_SCHEDULER`, default on, every 15 min) that ticks the automation engine: reminders, invoice/job/inventory/tool/damage/fleet checks, sequence steps, webhook retries, nightly backup, daily digest. All checks are idempotent (`dedupeKey` on notifications, open-task lookup).
- Workflow **templates ship paused** (lead won → job, job completed → invoice, critical damage → alert, proposal signed → task). Enable in Sales → Automation.
- `npm run verify` = lint + typecheck + test + build (same as CI). `npm run release` pushes `main` after verify; `deploy/production/deploy.sh` runs on the host with pre-deploy store snapshot, health check, and automatic rollback.
- New collections `automationRuns`, `adSources`, `adListings`, `optOuts`; store key **v10**.
- **Job-ad outreach is the owner's top automation priority** (`docs/OUTREACH.md`): ads → AI triage → lead → drafted reply → approval-gated email/SMS → follow-up → reply detection. Sending is opt-in via `OUTREACH_AUTOSEND`; opt-outs are enforced before every send. AI: `claude-opus-5` for drafting, `claude-haiku-4-5` for triage (`ANTHROPIC_FAST_MODEL`).
- Webhooks have `format` (json/slack/discord) and presets; inbound: `/api/sms/inbound`, `/api/voice/*` (Twilio), `/api/ads/inbound`, `/api/payments/webhook` (Stripe).
- **Job hub is the centre of gravity**: quote (e-sign at `/q/<token>`) → signed → job + deposit invoice + contract PDF → site updates → weekly report → final invoice → Stripe/e-Transfer payment → receipt → review + referral. `DOCS_AUTOSEND` decides what goes to the customer without a click; everything else is one button on `/admin/jobs/[id]`.
- Auth: signed httpOnly cookie (`SESSION_SECRET`), lockout after 5 failures, `src/middleware.ts` gates `/api/*` (public allowlist inside). `BHC_STRICT_AUTH=1` retires the legacy `x-bhc-user-id` header.
- Photos/signatures/PDFs are files under `data/media` (never base64 in the store any more); `media_offload` migrates old stores nightly.
- `BHC_STORE=sqlite` switches persistence to `data/store.sqlite` (Node ≥ 22.13); same `readStore/writeStore` API.
- Every meaningful action emits a `live.*` event; the dashboard and `/admin/live` stream them over SSE. Keep emitting from new features.
- Collections added this round: `quotes`, `documents`, `payments`, `messages` (+ `optOuts`, `adSources`, `adListings`, `automationRuns`). Store key **v10**.

## Demo accounts

| Role | Login | PIN |
|------|-------|-----|
| Admin | cameron | 1001 |
| Knocker | jamie | 1007 |
| Field | sam | 1003 |
| Driver | riley | 1005 |

## Successor checklist

1. Read `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DEPLOYMENT.md`, `docs/USAGE.md`, `docs/KNOCKER.md`, `docs/AI.md`, `docs/AUTOMATION.md`.
2. Run `npm run verify` (lint + typecheck + test + build). Node **22** is required for vitest 4.
3. Do not rewrite persistence to a real DB unless asked — JSON store is intentional.
4. Google Calendar **OAuth insert** is optional (`GOOGLE_CALENDAR_CLIENT_ID`). ICS + template URLs work without it.
5. True Web Push (VAPID) is optional; in-app + Notification API + `public/sw.js` are production-ready for PWA reminders.
6. Background GPS on iOS Safari is limited; the tracker uses `distanceFilter`, `desiredAccuracy`, wake lock, visibility restart, and battery-low backoff. Native Capacitor/React Native wrap is a future path documented in `docs/KNOCKER.md`.
