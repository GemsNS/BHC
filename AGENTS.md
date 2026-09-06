# AGENTS.md

## Cursor Cloud specific instructions

- Single Next.js app at repo root. Package manager: **npm** (`package-lock.json`).
- Dev server: `npm run dev` (binds `0.0.0.0:3000`).
  - Login: `/login` · Ops wall: `/admin/dashboard` · Board: `/admin/board` or `/apps/board` · Apps: `/apps` · Knocker: `/apps/knocker`
- Admin + field apps share one dark **CommandShell** (desktop rail / mobile chips + bottom tabs). Desktop rail is **collapsible** (chevron in header): expanded shows accordion sections with full labels; collapsed shows icon badges only. Preference stored in `localStorage` (`bhc-rail-collapsed`, `bhc-rail-sections-open`).
- Lint / test / build: `npm run lint`, `npm test`, `npm run build` (see `package.json` / `README.md`).
- Persistence: `data/store.json` (gitignored), auto-seeded; reset with `POST /api/seed`. No external DB required.
- Production reset: `POST /api/seed` returns staff credentials + writes `data/staff-credentials.json`. Clean HRM seed (no demo leads). See `docs/PRODUCTION.md`.
- Auth: every employee has `login` + `pin` (6-digit on production seed). Session is client-side (`bhc-auth-user-id`). No demo chips on `/login`.
- Static demo localStorage key: `bhc-crm-store-v10` (bump when `AppData` schema changes).
- **Public site (1:1 Seaside port):** `/` audience gate · `/residential` · `/commercial` · `/showcase` · `/brand-preview`. Full Seaside Contracting UI/assets (Halifax hero, exterior designer, job showcase gallery, responsive header) rebranded **BH Contracting Co.**. Staff entry: **Staff login** on gate + header → `/login`.
- Ops modules: tools in/out, inventory, damage reports, job progress (photos+notes), invoices vs full job reports.
- **Schedule:** `/admin/schedule` (team week grid) · `/apps/schedule` (claim pool). API: `/api/shifts`.
- **Sales hub:** `/admin/sales` — unified Pipeline, Client 360°, Automation, Support, Outreach tabs (replaces separate Leads/CRM/Workflows pages). Legacy URLs redirect automatically.
- **JARVIS layer:** live metric chips + expandable intelligence panel (breakdown, entities, actions) + ⌘K palette on admin/field screens. See `docs/AGENT_MEMORY.md`.
- **HUD command deck:** `/admin/dashboard` — immersive neon ops viz (SALES / INSTALL / ADMIN / NET / MKT radial dock) plus a compact JARVIS strip above the dock. Append `?classic=1` for the list-based ops wall.
- **Market terminal:** `/admin/markets` — Bloomberg-style ticker, competitor $/sqft grid, decision signals, Open-Meteo field weather; auto-refreshes every 30s. Uses terminal immersive chrome (no top bar / JARVIS bar); watchlist is a horizontal chip strip so it does not mirror the nav rail.
- Static demo localStorage key: `bhc-crm-store-v10` (bump when `AppData` schema changes). **Do not** pass `withBasePath()` to Next.js `Link` or `router.push` — Next adds `basePath` automatically; use `withBasePath` for `fetch` only.
- **Transfer docs:** `CLAUDE.md` + `docs/` (HANDOFF, ARCHITECTURE, API, DEPLOYMENT, USAGE, KNOCKER, AI).
- **Client AI (Pages testing):** paste Gemini key in `/admin/assistant` sidebar (localStorage) or set `NEXT_PUBLIC_GEMINI_API_KEY` — browser calls Gemini directly; status updates immediately after Save; invalid keys surface a real error (not “no API key”). Not for production secrets.
- **Active Knocker:** `/apps/knocker` (field) · `/admin/knocker` (command) — Map + **Zones** tab (former Territories page redirects here), GPS, color pins, routes, tasks, proposals, webhooks. Works on Pages via localStorage (no multi-user sync).
- **Books & P&L:** `/admin/books` — local 2-year P&L from CRM data + optional QuickBooks Online hook (`QUICKBOOKS_*` env or paste credentials; Node host required for QB API).
- **Mainframe AI:** `/admin/assistant` — CRM tools + `import_data`, `remember_knowledge`, `lookup_hrm` (HRM weather/geocode). Assistant memory persists in store. See `docs/PRODUCTION.md`.
- **BHC CLI:** `npm run bhc -- ai status|chat|summarize`, `store summary`, `automations list|run-daily|run <id>`. Requires local store (`data/store.json`); loads `.env` for AI keys.
- AI summarize: `POST /api/ai/summarize` (and progress/invoice flows). Uses Gemini or OpenAI when configured; otherwise local heuristic. See `.env.example`.
- Progress photos are compressed to JPEG data URLs and stored in `data/store.json` (fine for demo; swap to object storage later).
- Repo: `GemsNS/BHC` · Pages demo base path `/BHC`
- Static GitHub Pages demo: `npm run build:gh-pages` (temporarily moves `src/app/api`, sets `NEXT_PUBLIC_STATIC_DEMO=1` + `NEXT_PUBLIC_BASE_PATH=/BHC`). Client falls back to localStorage. Deploy with `npm run deploy:gh-pages`.
- Do not put long-running `next dev` in install/update scripts.
- User preference: merge completed feature PRs into `main` after verification.
