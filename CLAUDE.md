# CLAUDE.md — BH Contracting LTD. (BHC) development transfer

This file is the short briefing for a successor agent (Claude or otherwise).

**Full system map:** read [`docs/SYSTEM_OVERVIEW.md`](./docs/SYSTEM_OVERVIEW.md) next (architecture, data model, modules, presentations, deploy). Then `docs/HANDOFF.md` and the focused docs in `docs/`.

## What this product is

**BHC** is a Next.js 15 all-in-one ops CRM + field PWA for **BH Contracting LTD.** (subcontracting). It includes:

- Public marketing site (Seaside-contracting 1:1 port, rebranded BH)
- Staff CRM (leads, jobs, invoices, schedule, inventory, fleet, fuel, books)
- **Active Knocker** field canvassing (map, turfs, GPS, proposals, calendar, webhooks)
- **Mainframe AI** (Anthropic Claude preferred → Gemini → OpenAI → local parser)
- Password-gated customer presentations (`/presentations/[slug]`, e.g. Walid)
- GitHub Pages static demo + full API mode with JSON file store

Repo: `GemsNS/BHC` · Production: `https://bhcontracting.ca` · Static demo: `https://gemsns.github.io/BHC/` · Package manager: **npm**.

## Non-negotiables

1. **Do not commit secrets.** `.env` is gitignored. Never put Anthropic/Gemini/OpenAI keys in git. `NEXT_PUBLIC_GEMINI_API_KEY` is **temporary Pages testing only**.
2. **Production auth:** login + password (bootstrap PIN `0000`, then set password). Manage users in Admin → Team. Older “cameron/1001” demo accounts are legacy; production seed uses role logins (`admin`, `knocker`, etc.). `src/lib/normalize.ts` migrates old stores.
3. **Bump `bhc-crm-store-vN` in `src/lib/client-data.ts` when `AppData` schema changes.** Current: **v9**.
4. **Do not pass `withBasePath()` to Next `Link` / `router.push`.** Next applies `basePath`. Use `withBasePath` for `fetch` and service-worker URLs only.
5. **GitHub Pages builds strip `src/app/api`.** Static demo uses localStorage. Full AI/webhooks/calendar ICS need server mode (`npm run dev` / `npm start`).
6. **User preference:** merge verified feature PRs into `main`. Branch names: `cursor/<name>-22fe`.
7. **Do not put `next dev` in install/update scripts.**
8. **Customer presentation packages:** lock client geometry/facts; scrub AI vendor fingerprints from customer-facing assets; exclude third-party Vite source trees from `tsconfig` so `next build` does not typecheck them.

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
| Webhooks | `src/lib/webhooks.ts`, `/api/webhooks` |
| GPS | `src/lib/gps-tracker.ts` |
| AI | `src/lib/ai-provider.ts`, `src/lib/ai-client.ts`, `src/lib/mainframe-agent.ts` |
| CLI | `scripts/bhc-cli.ts` |
| Nav | `src/lib/nav.ts` |
| Full system overview | `docs/SYSTEM_OVERVIEW.md` |
| Docs | `docs/` |
| Presentations | `src/lib/presentations.ts`, `presentations/<slug>/` |
| Fuel / job travel | `src/lib/fuel-travel.ts` |

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

See `docs/PRODUCTION.md`. Static Pages demos may still carry older seeded logins via localStorage.

## Successor checklist

1. Read `docs/SYSTEM_OVERVIEW.md`, then `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DEPLOYMENT.md`, `docs/USAGE.md`, `docs/KNOCKER.md`, `docs/AI.md`, `docs/WALID_PRESENTATION_DEPLOY.md` as needed.
2. Run `npm test && npm run build`.
3. Do not rewrite persistence to a real DB unless asked — JSON store is intentional.
4. Google Calendar **OAuth insert** is optional (`GOOGLE_CALENDAR_CLIENT_ID`). ICS + template URLs work without it.
5. True Web Push (VAPID) is optional; in-app + Notification API + `public/sw.js` are production-ready for PWA reminders.
6. Background GPS on iOS Safari is limited; the tracker uses `distanceFilter`, `desiredAccuracy`, wake lock, visibility restart, and battery-low backoff. Native Capacitor/React Native wrap is a future path documented in `docs/KNOCKER.md`.
