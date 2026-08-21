# Big Hoss Contracting — All-in-One CRM

Operations CRM + web-hosted field apps for **Big Hoss Contracting** (subcontracting): role-based login, announcements, knocker zones, jobs, materials, fuel, fleet, hours, and stats.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you land on the **login** page.

### Demo accounts

| Role | Login | PIN |
| --- | --- | --- |
| Admin | `jordan` | `1001` |
| Knocker | `jamie` | `1007` |
| Field | `sam` | `1003` |
| Driver | `riley` | `1005` |

Roles only unlock the sections they are allowed to see (admin sidebar / field apps tabs).

| Surface | URL |
| --- | --- |
| Login | `/login` |
| Admin | `/admin/dashboard` |
| Announcements | `/admin/board` or `/apps/board` |
| Field apps hub | `/apps` |
| Knocker app | `/apps/knocker` |
| Time clock | `/apps/clock` or `/portal` |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server `0.0.0.0:3000` |
| `npm run lint` / `npm test` / `npm run build` | Quality checks |
| `npm run build:gh-pages` | Static demo export to `./out` |
| `npm run deploy:gh-pages` | Build + publish `gh-pages` branch |

## GitHub Pages demo

```bash
npm run deploy:gh-pages
```

Repo: [GemsNS/BHC](https://github.com/GemsNS/BHC)

Demo URL (after first deploy + Pages enabled on `gh-pages`):  
https://gemsns.github.io/BHC/

Static demo uses **localStorage** (no server APIs). Full local/cloud mode uses `data/store.json` + `/api/*`.

## Modules

- **Login & roles** — employee login/PIN; permission-gated nav
- **Announcements** — company message board with optional role audiences
- **Knocker** — zone assignment, door logs, GPS stamp, lead creation
- **Jobs / materials / fuel / fleet** — subcontract cost visibility
- **Statistics & projections** — knocks, spend, pipeline, monthly targets

## Responsive UI

- **Desktop (≥900px):** admin left sidebar; apps top tabs + wider content
- **Mobile:** admin horizontal section pills; apps bottom tab bar

## Data

Auto-seeded on first read. Reset:

```bash
curl -X POST http://localhost:3000/api/seed
```
