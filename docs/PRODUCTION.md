# Production reset — Halifax HRM

## Reset CRM to clean production seed

On a **Node host** (not GitHub Pages static demo):

```bash
curl -X POST http://localhost:3000/api/seed
```

Optional: set `SEED_SECRET` in `.env` and pass header `x-seed-secret`.

Response includes **`credentials`** — one-time staff logins and PINs. Also written to `data/staff-credentials.json` (gitignored).

## What you get

- Empty leads, jobs, invoices (start from scratch)
- Halifax Regional Municipality knocker zones + HRM assistant profile
- 8 staff accounts with random 6-digit PINs
- Mainframe **assistant memory** seeded with HRM ops context
- Public API hooks: Open-Meteo weather, OSM Nominatim geocoding (`/api/hrm`, Mainframe `lookup_hrm`)

## Mainframe AI — populate & learn

Paste customer lists or dictation in `/admin/assistant`. The AI uses:

| Tool | Purpose |
|------|---------|
| `import_data` | Bulk leads, jobs, companies, memory |
| `create_lead` / `create_job` / `create_employee` | Single records |
| `remember_knowledge` | Save facts for future sessions |
| `search_knowledge` | Recall saved facts |
| `lookup_hrm` | Weather + geocode Nova Scotia addresses |

## Staff roles (default seed)

| Role | Typical login pattern |
|------|------------------------|
| Admin | `liam` |
| Manager | `sarah` |
| Sales | `noah` |
| Knocker | `emma`, `james` |
| Field | `olivia`, `ethan` |
| Driver | `maya` |

**PINs change every seed** — always read the `credentials` array from the seed response.

## Browser demos

Static GitHub Pages uses `localStorage` key `bhc-crm-store-v9`. Clear site data or bump storage key after production schema changes.

## Legacy demo seed

Set `BHC_DEMO_SEED=1` and use `buildDemoSeedData()` from `src/lib/demo-seed.ts` only for local demos — not production.
