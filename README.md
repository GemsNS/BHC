# Big Hoss Contracting — All-in-One CRM

Operations CRM for **Big Hoss Contracting**: web admin panel, employee time portal, and connected tools for leads, jobs, door-to-door sales, fleet, hours, and payroll.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- Zod validation on API routes
- Local JSON file store in `data/store.json` (auto-seeded on first read)
- Vitest for unit tests

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- Admin panel: `/admin/dashboard`
- Employee portal (clock in/out): `/portal`

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on `0.0.0.0:3000` |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run build` | Production build |
| `npm start` | Run production build |

## Modules (v0 foundation)

| Area | Route | Notes |
| --- | --- | --- |
| Dashboard | `/admin/dashboard` | Ops pulse |
| Leads | `/admin/leads` | Create + advance pipeline |
| Jobs | `/admin/jobs` | Schedule / status |
| Door-to-door | `/admin/canvass` | Log stops; optional lead creation |
| Fleet | `/admin/fleet` | Vehicle board (mock coords) |
| Hours & payroll | `/admin/hours` | Punch rollup + pay estimate |
| Team | `/admin/team` | Roster |
| Employee portal | `/portal` | Clock in / out |

## Data

First API/page hit creates `data/store.json` from seed data. Reset with:

```bash
curl -X POST http://localhost:3000/api/seed
```

## Roadmap (next)

- Auth / roles (admin vs crew)
- Postgres + Prisma for multi-user production
- Real GPS / telematics for fleet
- Estimating, invoicing, document storage
- Payroll export (CSV / QuickBooks)
