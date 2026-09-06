# CLAUDE.md — BH Contracting LTD. (BHC) development transfer

This file is the short briefing for a successor agent (Claude or otherwise).

**Read next (in order):**
1. [`docs/CURSOR_BRIEFING.md`](./docs/CURSOR_BRIEFING.md) — master map of the **automation platform** (engine, outreach, job hub, inbox, live wire, auth, deploy)
2. [`docs/SYSTEM_OVERVIEW.md`](./docs/SYSTEM_OVERVIEW.md) — full **product/architecture** map (CRM surfaces, store, knocker, presentations, modules)
3. `docs/HANDOFF.md` and the focused docs in `docs/`

Prefer **code over stale markdown** when they conflict.

## What this product is

**BHC** is a Next.js 15 all-in-one ops CRM + field PWA for **BH Contracting LTD.** (subcontracting). It includes:

- Public marketing site (Seaside-contracting 1:1 port, rebranded BH)
- Staff CRM (leads, jobs, invoices, schedule, inventory, fleet, fuel, books)
- **Active Knocker** field canvassing (map, turfs, GPS, proposals, calendar, webhooks)
- **Mainframe AI** (Anthropic Claude preferred → Gemini → OpenAI → local parser)
- **Automation platform** (15‑min scheduler, workflows, webhooks, job-ad outreach, job hub, inbox/voice, live wire)
- Password-gated customer presentations (`/presentations/[slug]`, e.g. Walid)
- GitHub Pages static demo + full API mode with JSON/SQLite store

Repo: `GemsNS/BHC` · Production: `https://bhcontracting.ca` · Static demo: `https://gemsns.github.io/BHC/` · Package manager: **npm**.

## Non-negotiables

1. **Do not commit secrets.** `.env` is gitignored. Never put Anthropic/Gemini/OpenAI keys in git. `NEXT_PUBLIC_GEMINI_API_KEY` is **temporary Pages testing only**.
2. **Production auth:** login + password (bootstrap PIN `0000`, then set password). Manage users in Admin → Team. Signed httpOnly session cookie (`SESSION_SECRET`). Older “cameron/1001” demo accounts are legacy; production seed uses role logins (`admin`, `knocker`, etc.).
3. **Bump `bhc-crm-store-vN` in `src/lib/client-data.ts` when `AppData` schema changes.** Current: **v10**.
4. **Do not pass `withBasePath()` to Next `Link` / `router.push`.** Next applies `basePath`. Use `withBasePath` for `fetch` and service-worker URLs only.
5. **GitHub Pages builds strip `src/app/api`.** Static demo uses localStorage. Full AI/webhooks/calendar ICS/automation need server mode (`npm run dev` / `npm start`).
6. **User preference:** merge verified feature PRs into `main`. Branch names: `cursor/<name>-22fe`.
7. **Do not put `next dev` in install/update scripts.**
8. **Customer presentation packages:** lock client geometry/facts; scrub AI vendor fingerprints from customer-facing assets; exclude third-party Vite source trees from `tsconfig` so `next build` does not typecheck them.
9. **Production secrets before first automation deploy:** set `SESSION_SECRET` and `AUTOMATION_SECRET` in `/opt/bhc/.env`; staff must log in again after cookie auth lands.

## Quick commands

```bash
npm install
npm run dev          # 0.0.0.0:3000
npm test
npm run lint
npm run build
npm run verify       # lint + typecheck + test + build (CI parity)
npm run bhc -- ai status
npm run bhc -- store summary
npm run console      # interactive automation console
npm run deploy:gh-pages
```

## Where to look

| Need | Path |
|------|------|
| Automation master map | `docs/CURSOR_BRIEFING.md` |
| Full system overview | `docs/SYSTEM_OVERVIEW.md` |
| Types / store shape | `src/lib/types.ts` (`AppData`) |
| Seed + migrations | `src/lib/seed.ts`, `src/lib/normalize.ts`, `src/lib/store.ts` |
| Auth / roles | `src/lib/session.tsx`, `src/lib/auth-session.ts`, `ROLE_PERMISSIONS` in types |
| Knocker map/UI | `src/components/knocker/*`, `/apps/knocker`, `/admin/knocker` |
| Knocker API | `src/app/api/knocker/route.ts` |
| Calendar ICS | `src/lib/calendar.ts`, `GET /api/calendar` |
| Webhooks (signed, queued, retried) | `src/lib/webhooks.ts`, `/api/webhooks` |
| **Automation engine** | `src/lib/automation-engine.ts`, `automation-checks.ts`, `automation-defaults.ts`, `scheduler.ts`, `src/instrumentation.ts`, `/admin/automation`, `/api/automation`, `docs/AUTOMATION.md` |
| Event workflows | `src/lib/workflows.ts` |
| **Job-ad outreach** | `src/lib/ad-ingest.ts`, `ad-pipeline.ts`, `outreach-send.ts`, `/admin/ads`, `docs/OUTREACH.md` |
| Console | `scripts/bhc-console.ts` → `npm run console` |
| **Job hub** | `/admin/jobs/[id]`, `src/lib/job-hub.ts`, `quotes.ts`, `documents.ts`, `payments.ts` |
| Customer-facing pages | `/q/[token]` · `/pay/[token]` · `/portal/[token]` · `/r/[code]` |
| Inbox + voice | `src/lib/messaging.ts`, `/admin/inbox`, `/api/voice/*` |
| Live wire | `src/lib/events.ts`, `/api/stream`, `components/LiveWire.tsx`, `/admin/live` |
| Storage | `src/lib/store-backend.ts` (json / sqlite), `media-store.ts` |
| Deploy | `deploy/production/deploy.sh`, `.github/workflows/*` |
| AI | `src/lib/ai-provider.ts`, `src/lib/mainframe-agent.ts` |
| CLI | `scripts/bhc-cli.ts` |
| Nav | `src/lib/nav.ts` |
| Presentations | `src/lib/presentations.ts`, `presentations/<slug>/` |
| Fuel / job travel | `src/lib/fuel-travel.ts` |

## Automation (read `docs/AUTOMATION.md` + `docs/CURSOR_BRIEFING.md`)

- In-process scheduler (`BHC_SCHEDULER`, default on, every 15 min) ticks the automation engine.
- Workflow templates ship paused; enable in Admin → Automation.
- Job-ad outreach is approval-gated by default (`OUTREACH_AUTOSEND`).
- Auth: signed httpOnly cookie (`SESSION_SECRET`); `BHC_STRICT_AUTH=1` retires legacy header auth.
- Media lives under `data/media` (not base64 in the store).
- Optional `BHC_STORE=sqlite` for `data/store.sqlite`.
- Reseed keeping staff: `npm run bhc -- store reseed --yes` (PINs reset to `0000`).

## Production accounts (after `POST /api/seed`)

| Login | Role | Bootstrap |
|-------|------|-----------|
| admin | Admin | PIN `0000` → set password |
| manager | Manager | same |
| sales | Sales | same |
| knocker | Knocker | same |
| field | Field | same |
| office | Office | same |
| driver | Driver | same |

See `docs/PRODUCTION.md`.

## Successor checklist

1. Read `docs/CURSOR_BRIEFING.md`, then `docs/SYSTEM_OVERVIEW.md`, then focused docs as needed (`AUTOMATION`, `OUTREACH`, `ARCHITECTURE`, `API`, `DEPLOYMENT`, `KNOCKER`, `AI`, `WALID_PRESENTATION_DEPLOY`).
2. Run `npm run verify` (or `npm test && npm run build`). Node **22** required for current vitest.
3. Do not rewrite persistence to an external DB unless asked — JSON/SQLite store is intentional.
4. Google Calendar **OAuth insert** is optional; ICS + template URLs work without it.
5. True Web Push (VAPID) is optional; in-app + Notification API + SW are ready for PWA reminders.
6. Background GPS on iOS Safari is limited — see `docs/KNOCKER.md`.
