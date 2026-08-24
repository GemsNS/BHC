# BH Contracting LTD. — All-in-One CRM

Operations CRM + field PWA for **BH Contracting LTD.**: role-based login, Active Knocker, jobs, fleet, AI Mainframe, password-gated presentations, and a public marketing site.

**Successor / Claude / Cursor transfer:** start at [`CLAUDE.md`](./CLAUDE.md), then [`docs/CURSOR_BRIEFING.md`](./docs/CURSOR_BRIEFING.md) (automation master map), then [`docs/SYSTEM_OVERVIEW.md`](./docs/SYSTEM_OVERVIEW.md) (full architecture), then [`docs/HANDOFF.md`](./docs/HANDOFF.md).

## Documentation index

| Doc | Contents |
|-----|----------|
| [CLAUDE.md](./CLAUDE.md) | Agent briefing, non-negotiables |
| [docs/HANDOFF.md](./docs/HANDOFF.md) | Transfer of development + backlog |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Stack, store, auth, GPS, AI |
| [docs/API.md](./docs/API.md) | REST, webhooks, CLI |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Local, Pages, Node host, env |
| [docs/USAGE.md](./docs/USAGE.md) | Login, knocker flow, calendar, AI keys |
| [docs/KNOCKER.md](./docs/KNOCKER.md) | Map, GPS, proposals, push |
| [docs/AI.md](./docs/AI.md) | Gemini / OpenAI / Mainframe |
| [docs/AGENT_MEMORY.md](./docs/AGENT_MEMORY.md) | User prefs, chat log, agent continuity |
| Tutorials UI | `/admin/tutorials` · `/apps/tutorials` |

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → **login**.

### Demo accounts

| Role | Login | PIN |
| --- | --- | --- |
| Admin | `cameron` | `1001` |
| Knocker | `jamie` | `1007` |
| Field | `sam` | `1003` |
| Driver | `riley` | `1005` |

| Surface | URL |
| --- | --- |
| Login | `/login` |
| Admin deck | `/admin/dashboard` |
| Mainframe AI | `/admin/assistant` |
| Active Knocker | `/admin/knocker` · `/apps/knocker` |
| Field hub | `/apps` |
| Public site | `/` |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server `0.0.0.0:3000` |
| `npm run lint` / `npm test` / `npm run build` | Quality checks |
| `npm run verify` | Lint + typecheck + test + build (what CI runs) |
| `npm run release` | Verify → push `main` → CI deploys production (`docs/DEPLOYMENT.md`) |
| `npm run console` | Interactive console for the whole CRM (leads, jobs, quotes, docs, payments, inbox, ads, outreach, automations, webhooks; free text → Mainframe AI) |
| `docs/SETUP_CHECKLIST.md` | What to buy and configure: AI models, mailbox, Twilio, Stripe, review link, inbound + outbound webhooks |
| `npm run bhc -- <cmd>` | CLI — AI, store, automations, webhooks, backups, ads |
| `npm run automation:tick` / `automation:status` | Run / inspect the automation engine (`docs/AUTOMATION.md`) |
| `npm run store:backup` / `store:health` | Snapshot / integrity report for `data/store.json` |
| `npm run build:gh-pages` | Static demo → `./out` |
| `npm run deploy:gh-pages` | Publish `gh-pages` |

## GitHub Pages

```bash
npm run deploy:gh-pages
```

https://gemsns.github.io/BHC/ — localStorage demo (no server APIs). Full AI/webhooks need Node (`npm start`) plus `.env`.

## Modules

- **Login & roles** — PIN auth, permission-gated nav
- **Active Knocker** — map turfs, GPS, color pins, calendar, proposals + signatures, webhooks
- **Mainframe AI** — Gemini/OpenAI/local CRM assistant
- **Job progress** — photos + AI summarize
- **Invoices / job reports**
- **Schedule & shift pool**
- **Sales hub** — pipeline, 360, automation, outreach
- **JARVIS** — briefing bar + ⌘K
- **Public site** — BH-branded Seaside port

## Data

JSON store `data/store.json` (gitignored). Reset: `POST /api/seed`. Browser demos use `bhc-crm-store-v10`.
