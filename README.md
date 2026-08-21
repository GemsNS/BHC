# Big Hoss Contracting — All-in-One CRM

Operations CRM + web-hosted field apps for **Big Hoss Contracting** (subcontracting): knocker zones, jobs, materials, fuel, fleet, hours, roles, and stats.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Surface | URL |
| --- | --- |
| Admin | `/admin/dashboard` |
| Knocker zones (admin) | `/admin/zones` |
| Field apps hub | `/apps` |
| **Knocker app** | `/apps/knocker` |
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

Demo URL (after first deploy + Pages enabled on `gh-pages`):  
https://gemsns.github.io/BHC-ALL-IN-ONE/

Static demo uses **localStorage** (no server APIs). Full local/cloud mode uses `data/store.json` + `/api/*`.

## Modules

- **Knocker** — zone assignment, door logs, GPS stamp, lead creation, admin tracking
- **Jobs / materials / fuel / fleet** — subcontract cost visibility
- **Statistics & projections** — knocks, spend, pipeline, monthly targets
- **Users & roles** — admin, manager, sales, knocker, field, office, driver

## Data

Auto-seeded on first read. Reset:

```bash
curl -X POST http://localhost:3000/api/seed
```
