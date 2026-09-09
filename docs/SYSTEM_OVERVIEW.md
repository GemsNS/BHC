# BHC — Complete Technical System Overview

**Audience:** Claude (or any successor agent) building on this codebase with no prior chat history.  
**Repo:** `GemsNS/BHC` · **Package:** `bhc` · **Package manager:** npm  
**Company:** BH Contracting LTD. (Nova Scotia subcontracting — residential/commercial exterior work)  
**Live production:** `https://bhcontracting.ca` (Node host, typically `/opt/bhc`, systemd unit `bhc`)  
**Static demo:** `https://gemsns.github.io/BHC/` (GitHub Pages, no APIs)

Read [`CURSOR_BRIEFING.md`](./CURSOR_BRIEFING.md) first for the automation platform, then this document for the broader product/architecture. Use focused docs in `docs/` for deep dives. Prefer **code over stale docs** when they conflict — several older files still say “Co.” / store v8 / PIN-only auth.

---

> **Automation platform:** For the September 2026 automation engine, outreach, job hub, inbox, live wire, scheduler, auth hardening, and deploy/CI details, read [`CURSOR_BRIEFING.md`](./CURSOR_BRIEFING.md) first. This overview covers the broader product/architecture; some sections predate the automation build — prefer code + the briefing when they differ.


## 1. What this product is

BHC is a **single Next.js App Router monolith** that combines:

| Surface | Purpose | Routes |
|---------|---------|--------|
| Public marketing site | Seaside Contracting 1:1 port, rebranded BH | `/`, `/residential`, `/commercial`, `/showcase`, `/pricing`, legal |
| Staff CRM / ops | Leads, jobs, invoices, schedule, inventory, fleet, fuel, books | `/admin/*` |
| Field PWA apps | Clock, board, knocker, tools, damage, progress, schedule pool | `/apps/*` |
| Auth | Login + first-time password set | `/login`, `/login/set-password` |
| Client portal | Customer-facing entry (light) | `/portal` |
| Password presentations | Private customer packages (e.g. Walid) | `/presentations/[slug]` |
| REST APIs | All mutations / AI / integrations | `/api/*` (Node mode only) |
| CLI | Store + AI + automations | `npm run bhc -- …` |

There is **no separate backend service** and **no SQL database**. Persistence is one JSON aggregate (`AppData`) on disk or in `localStorage`.

---

## 2. Stack (current)

| Layer | Choice |
|-------|--------|
| Framework | Next.js **15.5.x** (App Router), React **19** |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS **4** + `src/app/globals.css` (marketing / HUD / knocker layers) |
| Validation | Zod on API request bodies |
| Maps | Leaflet (dynamic import, SSR off), Supercluster |
| Motion | Framer Motion (marketing / HUD) |
| Tests | Vitest (`tests/`) |
| Email | Nodemailer (GoDaddy SMTP) and/or Resend |
| AI | Anthropic Claude (preferred) → Gemini → OpenAI → local parser |
| Accounting | Optional QuickBooks Online OAuth |
| Icons | lucide-react |

**Not used:** Prisma, Postgres, Redis, GraphQL, separate microservices.

---

## 3. Runtime modes

Controlled by `next.config.ts` + env:

| Mode | How | Persistence | `/api/*` |
|------|-----|-------------|----------|
| **Full Node** (dev/prod) | `npm run dev` / `npm run build && npm start` | `data/store.json` | Yes |
| **Static Pages demo** | `npm run deploy:gh-pages` | `localStorage` key `bhc-crm-store-v9` | No (API tree stripped at build) |

Helpers: `src/lib/paths.ts` → `isStaticDemo()`, `withBasePath()`.

**Critical path rule:** Do **not** pass `withBasePath()` into Next `<Link>` or `router.push` — Next already applies `basePath`. Use `withBasePath` only for `fetch` and service-worker URLs.

---

## 4. Directory map

```
src/app/(site)/              Public marketing (Seaside port)
src/app/admin/               Staff CRM pages
src/app/apps/                Field PWA pages
src/app/login/               Auth UI
src/app/presentations/       Password-gated customer packages
src/app/api/                 REST route handlers (omitted in static export)
src/lib/                     Domain logic, store, AI, knocker, mail, QB, presentations
src/lib/knocker/             Geo (RDP, PIP), cluster, seed knocker data
src/lib/site/ · marketing/   Public-site helpers
src/components/              Shells, knocker, mainframe, site, presentations, brand
src/components/command-deck/ HUD dashboard
src/components/cc/           Command chrome / JARVIS pieces
public/                      PWA manifest, sw.js, static assets
presentations/<slug>/        On-disk customer packages (meta, clean SPA, package files)
contracts/                   Imported contract files (synced into AppData.contracts)
data/store.json              Live store (gitignored)
scripts/                     bhc-cli, gh-pages build/deploy
docs/                        This overview + focused guides
tests/                       Vitest suite
deploy/                      Host-specific notes (e.g. GCP)
```

Path alias: `@/*` → `./src/*` (`tsconfig.json`).

**Build exclusion:** `presentations/walid/source/**` (and similar Manus/Vite trees) are **excluded from TypeScript** so Next does not typecheck third-party Vite `@/` sources during `next build`.

---

## 5. Data model & persistence

### 5.1 Single aggregate: `AppData`

Defined in `src/lib/types.ts`. All CRM/ops state is one document:

**Core CRM:** `employees`, `leads`, `jobs`, `companies`, `deals`, `activities`, `tickets`, `invoices`, `shifts`, `timeEntries`

**Field / yard:** `materials`, `tools`, `toolCheckouts`, `inventory`, `inventoryTxns`, `damageReports`, `jobProgress`, `vehicles`, `fuelLogs`, `announcements`

**Knocker:** `zones`, `knocks`, `knockTerritories`, `knockTags`, `knockProducts`, `knockServices`, `knockTodos`, `knockProposals`, `knockChat`, `knockRepLocations`, `knockColorCodes`, `knockCalendarEvents`, `gpsConfig`

**Integrations / AI:** `webhookEndpoints`, `webhookDeliveries`, `pushSubscriptions`, `notifications`, `workflows`, `workflowRuns`, `sequences`, `sequenceEnrollments`, `outreachQueue`, `assistantProfiles`, `assistantAutomations`, `assistantAudit`, `assistantMemory`, `contracts`, `projections`

### 5.2 Server path

```
readStore() → JSON.parse(data/store.json) → normalizeStore() → maybe writeStore()
updateStore(mutator) → mutate → atomic write (tmp + rename)
```

Implementation: `src/lib/store.ts`. Seed on missing file: `buildSeedData()` / production seed via `POST /api/seed`.

### 5.3 Client path

```
loadAppData() → GET /api/store  (or localStorage in static/demo fallback)
mutateAppData(fn) → saveAppData → PUT /api/store or localStorage
```

Implementation: `src/lib/client-data.ts`.

**Schema versioning:** bump `bhc-crm-store-vN` in `client-data.ts` when `AppData` shape changes. **Current: `bhc-crm-store-v9`** (legacy keys v4–v8 migrated on read).

**Migrations:** `normalizeStore()` in `src/lib/normalize.ts` fills missing arrays/objects so old stores keep loading. Prefer additive fields + normalize over breaking renames.

### 5.4 Intentional non-goals

- Do **not** migrate to Postgres/object storage unless explicitly asked.
- Photos/progress images are often JPEG **data URLs** inside the JSON store — fine for demo/small ops; will not scale forever.
- Single-tenant / single-company store only.

---

## 6. Auth & RBAC

### 6.1 Staff auth (current)

- Each `Employee` has `login`, optional `pin`, optional `passwordHash`, `mustChangePassword`, `role`, `active`.
- Production bootstrap: PIN **`0000`** → forced password set on first login (`/login/set-password`).
- API: `POST /api/auth/login` with `{ login, password }` (password can be PIN or hashed password).
- Client session: `localStorage` key `bhc-auth-user-id` (`src/lib/session.tsx`).
- Permissions: `ROLE_PERMISSIONS` + `can()` / `RequireAuth` gates.
- User admin: **Admin → Team** (`/admin/team`).

Default production logins after seed (`docs/PRODUCTION.md`): `admin`, `manager`, `sales`, `knocker`, `field`, `office`, `driver` — all PIN `0000` until password set.

### 6.2 Roles → home

`homeForRole()` in `types.ts`: admin/manager/office/sales → `/admin/dashboard`; field/knocker/driver → `/apps` (or board).

### 6.3 Known hardening gap

Session is client-held user id. APIs are effectively **trusted-LAN / same-origin demo** until httpOnly cookies + lockout. Documented backlog in `docs/HANDOFF.md`. Do not treat this as internet-hardened auth without work.

### 6.4 Presentation auth (separate)

Customer presentations use **SHA-256 password hashes** in `presentations/<slug>/meta.json`, unlock cookie `bhc-pres-<slug>`, rate-limited unlock API. Independent of staff CRM auth.

---

## 7. UI shells & navigation

| Shell | Where | Notes |
|-------|-------|-------|
| Site layout | `(site)/layout.tsx` | Marketing chrome |
| `CommandShell` | Admin + apps | Collapsible rail; prefs `bhc-rail-collapsed`, `bhc-rail-sections-open` |
| `AppsShell` | `/apps/*` | Bottom tabs on mobile |
| JARVIS | Admin/field | Metric chips + ⌘K palette (`docs/AGENT_MEMORY.md`) |
| Immersive markets | `/admin/markets` | No JARVIS top bar |
| Presentation gate | `/presentations/*` | Minimal chrome; password wall |

Nav source of truth: `src/lib/nav.ts` (`ADMIN_NAV_SECTIONS`). Sales hub `/admin/sales` consolidates pipeline/CRM/workflows/outreach; legacy URLs redirect.

---

## 8. Feature modules (what exists)

### 8.1 Public site

Seaside-port marketing: audience gate, residential/commercial, showcase gallery, pricing, brand preview, legal. Staff entry via “Staff login” → `/login`. Do not casually rewrite; preserve established Seaside visual language unless asked.

### 8.2 CRM & sales

Leads, deals, companies, activities, tickets, sequences, outreach queue (often `pending_approval` until SMTP wired), canvassing admin, sales pipeline UI.

### 8.3 Jobs & delivery

Jobs lifecycle, materials, progress (photos + notes + AI summarize), invoices vs full job reports, contracts records.

### 8.4 Workforce

Schedule week grid (`/admin/schedule`), open shift pool (`/apps/schedule`), time entries / payroll hours, team management.

### 8.5 Assets

Inventory + txns, tool checkout, fleet, fuel logs, damage reports.

### 8.6 Active Knocker (field canvassing)

Primary UX: `src/components/knocker/KnockerCommandCenter.tsx`  
Routes: `/apps/knocker`, `/admin/knocker`  
API: `GET/POST /api/knocker` (action-based POST)

Capabilities: map, turf draw (Ramer–Douglas–Peucker + point-in-polygon), color pins, clustering, double-knock 409, GPS breadcrumbs (`gps-tracker.ts`), route optimize + Maps/Waze links, todos, team chat, proposals + signature pad, calendar ICS, webhooks (HMAC `X-BHC-Signature`).

Deep dive: `docs/KNOCKER.md`, `docs/API.md`.

### 8.7 Mainframe AI

UI: `/admin/assistant`  
Pipeline (`docs/AI.md`, `src/lib/ai-provider.ts`, `mainframe-agent.ts`, `mainframe-tools.ts`, `mainframe-crm-tools.ts`):

1. Optional browser Gemini key (static demo / testing only)
2. `POST /api/ai/chat` → provider agent loop with tools
3. Local regex intent parser + `executeMainframeTool` fallback

Provider order: **Anthropic → Gemini → OpenAI → none/local**.  
Tools include CRM CRUD, `import_data`, `remember_knowledge`, `search_knowledge`, `lookup_hrm` (Open-Meteo + Nominatim), automations.

Budgets/throttles: `ai-budget.ts`, `ai-budget-limits.ts`, env knobs in `.env.example`.

CLI: `npm run bhc -- ai status|chat|summarize`, `store summary`, `automations …`.

### 8.8 Books & QuickBooks

`/admin/books` — local P&L from CRM data + optional QBO OAuth (`/api/quickbooks/*`). Setup: `docs/QUICKBOOKS_INTUIT_SETUP.md`.

### 8.9 Markets / HUD

`/admin/dashboard` — command deck (neon ops viz); `?classic=1` for list wall.  
`/admin/markets` — ticker, competitor grid, weather, decision signals.

### 8.10 Contact / mail

`POST /api/contact` — rate-limited; SMTP and/or Resend. See `docs/GODADDY_EMAIL_SETUP.md`.

### 8.11 Password-gated presentations

Generic slug system under `presentations/<slug>/`:

| File / dir | Role |
|------------|------|
| `meta.json` | Title, customer, `passwordSha256` |
| `manifest.json` | File inventory for raw view |
| `clean/` | Customer-facing static SPA (served under `/view/`) |
| `package/` | Full document package for raw/ZIP download |
| `source/` | Optional archive (may contain third-party Vite apps — **exclude from tsconfig**) |

Routes:

- `/presentations/[slug]` — gate + package UI  
- `/presentations/[slug]/raw` — raw inventory  
- `/presentations/[slug]/view/[[...path]]` — serves clean SPA assets  
- `/presentations/[slug]/files/[...path]` — package file streaming  
- `POST /api/presentations/[slug]/unlock` · `GET …/status`

Lib: `src/lib/presentations.ts`.

#### Walid example (reference implementation)

- Slug: `walid` · Password: `walid`  
- Site: Mount Uniacke warehouse extension siding package  
- **Geometry rule:** permit plate / openings / ground slope are **locked** — concepts are cladding **application** only (Cedar Datum, Full Battens, Split Storey, Framed Bays), not building redesign  
- Fuel math: `src/lib/fuel-travel.ts` — Dartmouth ↔ Uniacke RT 69.8 km @ CRA $0.72/km; 3 weeks + 1 week pushback × 5 days = 20 RTs → **$1,005.12** included fuel  
- Deploy notes: `docs/WALID_PRESENTATION_DEPLOY.md`  
- Tests: `tests/walid-presentation.test.ts`, `tests/fuel-travel.test.ts`

**Presentation hygiene lessons (apply to future client packages):**

1. Lock client facts (address, measurements, openings) — never “improve” geometry without explicit instruction.  
2. Scrub AI / vendor fingerprints (telemetry, “Made with…”, generator comments) from customer-facing `clean/`.  
3. Keep third-party source trees out of Next typecheck (`tsconfig` exclude).  
4. Share only password URL — do not link from public marketing site.  
5. Prefer official elevations/photos as visual truth over invented massing.

---

## 9. API surface (summary)

Full table: `docs/API.md`.

Important groups:

| Group | Paths |
|-------|-------|
| Store | `GET/PUT /api/store`, `POST /api/seed` |
| Auth | `POST /api/auth/login` (+ password change paths in same route family) |
| AI | `/api/ai/chat`, `/api/ai/summarize`, `/api/ai/status`, `/api/assistant` |
| Knocker | `/api/knocker`, legacy `/api/knocks` |
| Calendar | `GET /api/calendar` (ICS) |
| Webhooks | `/api/webhooks` |
| CRM ops | leads, jobs, crm, invoices, shifts, employees, inventory, tools, fleet, fuel, materials, damage, tickets, workflows, outreach, announcements, time-entries, dashboard, stats, markets, canvass, zones, progress, uploads, hrm, contact |
| QuickBooks | `/api/quickbooks/connect|callback|disconnect|status|pnl` |
| Presentations | `/api/presentations/[slug]/unlock|status` |

Zod validates bodies. Rate limits exist for AI, contact, presentation unlock, uploads (env-configurable).

---

## 10. Environment & secrets

Template: `.env.example`. **Never commit `.env`.**

| Area | Vars |
|------|------|
| AI | `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_*`, `AI_PROVIDER`, budget/rate limits |
| Public Gemini (Pages only) | `NEXT_PUBLIC_GEMINI_*` — **insecure**, testing only |
| Mail | `SMTP_*`, `RESEND_API_KEY`, `CONTACT_TO_EMAIL` |
| Captcha | Turnstile / hCaptcha |
| QB | `QUICKBOOKS_*`, `APP_BASE_URL` |
| Static | `NEXT_PUBLIC_STATIC_DEMO`, `NEXT_PUBLIC_BASE_PATH` |
| Seed | `SEED_SECRET`, `BHC_DEMO_SEED` |

---

## 11. Deployment

### Production (bhcontracting.ca)

```bash
cd /opt/bhc
git fetch origin && git checkout main && git pull origin main
# npm ci only when lockfile changed / approved
npm run build && sudo systemctl restart bhc
```

Persist `data/` across deploys. TLS via reverse proxy.

### Local

```bash
npm install
cp .env.example .env   # add keys as needed
npm run dev            # 0.0.0.0:3000
npm test && npm run lint && npm run build
```

### GitHub Pages

```bash
npm run deploy:gh-pages
```

Strips `src/app/api`, sets static export + `/BHC` base path.

More: `docs/DEPLOYMENT.md`, `docs/PRODUCTION.md`.

---

## 12. Testing & verification bar

```bash
npm test          # Vitest
npm run lint
npm run build
```

UI path: login → changed surface. Knocker GPS/calendar/propose need a real browser. Presentation smoke: unlock cookie + `/view/` 200 (see Walid deploy doc).

Before calling work done: tests + build green; for UI changes, exercise the actual route.

---

## 13. Git / agent conventions

- Branches: `cursor/<kebab-name>-22fe` off `main`
- Prefer draft PR → verify → merge to `main`
- Do not force-push; do not put secrets in git
- Do not put `next dev` in install/update scripts
- User preference: merge verified feature PRs into `main`
- When `AppData` changes: update `types.ts` + `normalize.ts` + bump `bhc-crm-store-vN`

---

## 14. Intentional backlog (do not rediscover as “bugs”)

1. Postgres / object storage for scale  
2. Real SMTP fully wired for outreach send  
3. Google Calendar OAuth `events.insert` (ICS already works)  
4. Web Push VAPID (local Notification API + SW already work)  
5. Native wrap (Capacitor) for true background GPS on iOS  
6. Auth hardening (httpOnly cookies, lockout)  
7. Multi-tenant  

---

## 15. Where to edit (cheat sheet)

| Task | Start here |
|------|------------|
| Types / schema | `src/lib/types.ts`, `normalize.ts`, bump storage key |
| Server persistence | `src/lib/store.ts` |
| Client load/save | `src/lib/client-data.ts` |
| Auth / session | `src/lib/session.tsx`, `src/app/api/auth/login` |
| Permissions / home | `ROLE_PERMISSIONS`, `homeForRole` in `types.ts` |
| Admin nav | `src/lib/nav.ts` |
| Knocker UX | `src/components/knocker/*` |
| Knocker API | `src/app/api/knocker/route.ts` |
| AI tools | `mainframe-tools.ts`, `mainframe-crm-tools.ts`, `mainframe-agent.ts` |
| AI providers | `ai-provider.ts`, `ai-client.ts` |
| Fuel / travel math | `src/lib/fuel-travel.ts` |
| Presentations | `src/lib/presentations.ts`, `presentations/<slug>/`, `src/app/presentations/*` |
| Marketing site | `src/components/site/*`, `src/app/(site)/*` |
| CLI | `scripts/bhc-cli.ts` |
| Seed | `production-seed.ts`, `seed.ts`, `demo-seed.ts` |

---

## 16. Doc index

| Doc | Topic |
|-----|-------|
| `CLAUDE.md` | Short transfer briefing |
| `docs/HANDOFF.md` | Successor checklist + backlog |
| `docs/ARCHITECTURE.md` | Stack + pipelines |
| `docs/API.md` | HTTP reference |
| `docs/DEPLOYMENT.md` | Environments |
| `docs/PRODUCTION.md` | Seed + first login + HRM |
| `docs/USAGE.md` | Operator usage |
| `docs/KNOCKER.md` | Field canvassing deep dive |
| `docs/AI.md` | Mainframe AI |
| `docs/AGENT_MEMORY.md` | JARVIS / memory |
| `docs/WALID_PRESENTATION_DEPLOY.md` | Walid package deploy |
| `docs/QUICKBOOKS_INTUIT_SETUP.md` | QBO |
| `docs/GODADDY_EMAIL_SETUP.md` | SMTP |
| **`docs/SYSTEM_OVERVIEW.md`** | **This file — full system map** |

---

## 17. Mental model for building on top

1. **One app, one store.** New domain data almost always means a new array (or fields) on `AppData`, normalize defaults, optional API route, admin/apps page gated by `Permission`.  
2. **Server truth in Node mode; localStorage in static mode.** Feature that needs multi-user sync or secrets must use `/api/*` and document Pages limitations.  
3. **RBAC is permission strings, not ad-hoc role checks** — add to `Permission` + `ROLE_PERMISSIONS` + nav.  
4. **Customer deliverables** that leave the CRM (presentations, contracts) live on disk under `presentations/` or `contracts/`, with thin Next routes for auth and serving.  
5. **AI is a tool-using agent over the same store** — extend tools rather than inventing a parallel data path.  
6. **Preserve client facts.** For design packages, locked measurements beat “creative” redesigns.  
7. **Trust code + tests** when older markdown disagrees (company name, store version, auth model).

This is the system. Build additive features against `AppData` and the App Router surfaces above unless the product owner asks for a persistence or auth rewrite.
