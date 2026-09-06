# Production reset — Halifax HRM

## Reset CRM to clean production seed

On a **Node host** (not GitHub Pages static demo):

```bash
curl -X POST http://localhost:3000/api/seed
```

Optional: set `SEED_SECRET` in `.env` and pass header `x-seed-secret`.

Response lists **one account per role** with default bootstrap PIN **`0000`**. No random PINs are generated.

## First-time staff login

1. Go to `/login`
2. Sign in with role login (e.g. `admin`) and PIN **`0000`**
3. Set a personal password (min 6 characters)
4. Continue to the workspace

## Manage users (Admin → Team)

Use **Admin → Team** (`/admin/team`) to:

- View staff, roles, and password status
- Add team members (default PIN `0000`, must set password on first login)
- Reset a password (restores PIN `0000` and forces password setup)
- Activate / deactivate accounts

No CLI seeding or credential files required.

## Default production accounts

| Login | Role |
|-------|------|
| `admin` | Admin |
| `manager` | Manager |
| `sales` | Sales |
| `knocker` | Knocker |
| `field` | Field |
| `office` | Office |
| `driver` | Driver |

All accounts start with PIN **`0000`** until a password is set.

## What you get after seed

- Empty leads, jobs, invoices (start from scratch)
- Halifax Regional Municipality knocker zones + HRM assistant profile
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

## Browser demos

Static GitHub Pages uses `localStorage` key `bhc-crm-store-v10`. Clear site data or bump storage key after production schema changes.

## Legacy demo seed

Set `BHC_DEMO_SEED=1` and use `buildDemoSeedData()` from `src/lib/demo-seed.ts` only for local demos — not production.
