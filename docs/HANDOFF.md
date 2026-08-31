# Handoff — transfer of BHC development

Audience: a new engineer or Claude session taking over this repo with no prior chat history.

## Product snapshot

BH Contracting LTD. runs sales, canvassing, jobs, and field ops from one Next.js app. Staff authenticate with **login + password** (default PIN `0000` on first sign-in, then set password). Data lives in `data/store.json` (server) or `localStorage` key `bhc-crm-store-v9` (static GitHub Pages demo). Manage users in **Admin → Team**.

Two deployment modes:

| Mode | How | Persistence | APIs |
|------|-----|-------------|------|
| Full (dev/prod Node) | `npm run dev` / `npm start` | `data/store.json` | All `/api/*` |
| Static Pages demo | `npm run deploy:gh-pages` | localStorage | None (client fallbacks) |

## Architecture in one paragraph

Next.js App Router (`src/app`). Public site under `(site)`. Staff under `/login`, `/admin/*`, `/apps/*`. Shared `CommandShell` + JARVIS bar. Domain logic in `src/lib`. Mutations go through `readStore`/`writeStore` or `mutateAppData` (client). `normalizeStore` fills missing collections so old demos keep loading.

See `docs/ARCHITECTURE.md`.

## Feature map (what is production-ready)

- Public site, login, CRM, jobs, invoices, schedule, inventory, fleet, tools, damage, progress + AI summarize
- Mainframe AI (Gemini / OpenAI / local) + CLI
- Active Knocker: map, turf draw (RDP + PIP), color pins, clustering, double-knock, GPS breadcrumbs, route + Maps/Waze, tasks, team chat, leaderboard
- **Google Calendar sync:** ICS download + Google Calendar template URL + `GET /api/calendar` feed
- **Push notifications:** Notification permission, in-app `notifications[]`, service worker `public/sw.js`, due-task polling
- **Digital signature canvas:** `SignaturePad` → PNG data URL on proposal
- **GPS tuning:** `distanceFilterMeters`, `desiredAccuracy` high/balanced/low, wake lock, battery backoff
- **Webhooks:** HMAC-SHA256 `X-BHC-Signature`, event catalog, delivery log
- **Proposal/sign-off UI:** catalog picker, totals, sign canvas, signed status + preview

## Future needs (intentional backlog)

These are documented so the next agent does not rediscover them as “missing”:

1. **Postgres / object storage** — JSON + data-URL photos will not scale.
2. **Real SMTP (GoDaddy)** — outreach stays `pending_approval` until wired.
3. **Google Calendar OAuth** — ICS works; server-side `events.insert` needs OAuth client + refresh tokens per employee.
4. **Web Push VAPID** — SW + local notifications work; cross-device push needs VAPID keys + `web-push`.
5. **Native iOS/Android** — wrap PWA (Capacitor) for true background GPS when Safari suspends JS.
6. **Auth hardening** — session is `localStorage` user id; add httpOnly cookies / PIN lockout for production internet exposure.
7. **Multi-tenant** — single company store today.

## Files you will edit most

- Knocker UX: `src/components/knocker/KnockerCommandCenter.tsx`
- Store schema: `src/lib/types.ts` + `normalize.ts` + bump storage key
- APIs: `src/app/api/**/route.ts`
- AI tools: `src/lib/mainframe-tools.ts`, `src/lib/mainframe-agent.ts`

## Git / PR conventions

- Branches: `cursor/<kebab>-22fe` off `main`
- Draft PR then mark ready; user prefers merge to `main` after verification
- Do not force-push

## Verification bar

Before calling work done: `npm test`, `npm run lint` (errors only), `npm run build`, and a UI path through login → the changed surface. Knocker GPS/calendar/propose need `/apps/knocker` with a real browser (geolocation + Notification permission).
