# Architecture

## Stack

- **Next.js 15.5** (App Router) + React 19 + TypeScript
- **Tailwind CSS 4** + `src/app/globals.css` (HUD / knocker / marketing layers)
- **Zod** request validation on API routes
- **Vitest** unit tests (`tests/`)
- **Leaflet** maps (dynamic import, SSR off)
- **Resend** optional contact email
- No database. Persistence is a JSON document.

## Runtime modes

`next.config.ts` switches on env:

- `NEXT_PUBLIC_STATIC_DEMO=1` → `output: "export"`, no API routes (moved aside by `scripts/build-gh-pages.sh`)
- `NEXT_PUBLIC_BASE_PATH=/BHC` → GitHub Pages nested path

`src/lib/paths.ts`: `isStaticDemo()`, `withBasePath()` (fetch only).

## Data model

`AppData` in `src/lib/types.ts` is the single aggregate. Important collections:

- Core CRM: `employees`, `leads`, `jobs`, `deals`, `invoices`, `shifts`, …
- Knocker: `zones`, `knocks`, `knockTerritories`, `knockTags`, `knockProducts`, `knockServices`, `knockTodos`, `knockProposals`, `knockChat`, `knockRepLocations`, `knockColorCodes`, `knockCalendarEvents`
- Integrations: `webhookEndpoints`, `webhookDeliveries`, `pushSubscriptions`, `notifications`, `gpsConfig`
- AI: `assistantProfiles`, `assistantAutomations`, `assistantAudit`

Load path:

```
readStore() → JSON.parse → normalizeStore() → persist if migration needed
```

Client path:

```
loadAppData() → GET /api/store or localStorage
mutateAppData(fn) → saveAppData
```

Seed: `src/lib/seed.ts` + `src/lib/knocker/seed-data.ts`. Reset: `POST /api/seed`.

## Auth & RBAC

- Each `Employee` has `login`, `pin`, `role`
- Session: `bhc-auth-user-id` in localStorage (`src/lib/session.tsx`)
- Permissions: `ROLE_PERMISSIONS` + `RequireAuth` / `can()`
- Knocker field role sees assigned zones only; admin/manager see all

## UI shells

- Public: `(site)/layout.tsx` — Seaside-port marketing
- Admin: `CommandShell` + collapsible rail (`src/lib/nav.ts` sections)
- Apps: `AppsShell` + bottom tabs on mobile
- JARVIS: `JarvisBar` + command palette
- Markets page uses immersive chrome (no JARVIS)

## AI pipeline

```
UI → sendMainframeMessage
  1. Browser Gemini key (localStorage / NEXT_PUBLIC_*) via ai-client.ts
  2. POST /api/ai/chat → runMainframeTurn → ai-provider (GEMINI_API_KEY then OPENAI)
  3. Local regex parser (parseLocalIntent) + executeMainframeTool
```

Summarize: `summarizeProgress` same provider order; field progress page uses `clientSummarizeProgress` in static demo.

## Knocker geo pipeline

User draw → sampled lat/lng → Ramer–Douglas–Peucker (`simplifyPath`) → close polygon → Leaflet overlay → `pointInPolygon` / `bindPinsToTerritory`. Clustering: grid at low zoom (`src/lib/knocker/cluster.ts`). Route: nearest-neighbor (`optimizeRoute`).

## GPS tracker

`startGpsTracker` (`src/lib/gps-tracker.ts`):

- `watchPosition` with accuracy profile
- Skip updates closer than `distanceFilterMeters` (haversine)
- Re-subscribe on `visibilitychange` (background tab return)
- Optional Screen **Wake Lock**
- Battery API: if level &lt; 15%, force low-accuracy mode

Pings persist as `knockRepLocations` (capped 500).

## Service worker

`public/sw.js` registered by `ServiceWorkerRegister`. Handles `message` `{type:notify}`, `push`, `notificationclick`. Manifest: `public/manifest.webmanifest`.

## Directory map

```
src/app/(site)/          public marketing
src/app/admin/           staff CRM
src/app/apps/            field PWA surfaces
src/app/api/             REST (omitted in static export)
src/lib/                 domain, store, AI, knocker, calendar, webhooks
src/components/          shells, knocker, mainframe, site
scripts/                 gh-pages, bhc CLI
docs/                    this documentation set
data/store.json          gitignored live store
```
