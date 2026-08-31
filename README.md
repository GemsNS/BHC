# BH Contracting Co. — All-in-One CRM

Operations CRM + field PWA for **BH Contracting Co.**: role-based login, Active Knocker, jobs, fleet, AI Mainframe, and a public marketing site.

**Successor / Claude transfer:** start at [`CLAUDE.md`](./CLAUDE.md) then [`docs/HANDOFF.md`](./docs/HANDOFF.md).

## Documentation index

| Doc | Contents |
|-----|----------|
| [CLAUDE.md](./CLAUDE.md) | Agent briefing, non-negotiables |
| [docs/HANDOFF.md](./docs/HANDOFF.md) | Transfer of development + backlog |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Stack, store, auth, GPS, AI |
| [docs/API.md](./docs/API.md) | REST, webhooks, CLI |
| [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Local, Pages, Node host, env |
| [docs/GCP_GROK_DEPLOY.md](./docs/GCP_GROK_DEPLOY.md) | **Google Cloud** runbook for Grok / agents |
| [docs/USAGE.md](./docs/USAGE.md) | Login, knocker flow, calendar, AI keys |
| [docs/KNOCKER.md](./docs/KNOCKER.md) | Map, GPS, proposals, push |
| [docs/AI.md](./docs/AI.md) | Gemini / OpenAI / Mainframe |
| [docs/AGENT_MEMORY.md](./docs/AGENT_MEMORY.md) | User prefs, chat log, agent continuity |

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
| `npm run bhc -- <cmd>` | CLI — AI, store, automations |
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

JSON store `data/store.json` (gitignored). Reset: `POST /api/seed`. Browser demos use `bhc-crm-store-v8`.
