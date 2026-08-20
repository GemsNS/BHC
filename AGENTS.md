# AGENTS.md

## Cursor Cloud specific instructions

- Single Next.js app at repo root. Package manager: **npm** (`package-lock.json`).
- Dev server: `npm run dev` (binds `0.0.0.0:3000`). Admin UI at `/admin/dashboard`; employee clock portal at `/portal`.
- Lint / test / build: `npm run lint`, `npm test`, `npm run build` (see `package.json` and `README.md`).
- Persistence is a local JSON store at `data/store.json` (gitignored). It is auto-created and seeded on first read; reset with `POST /api/seed`. No external database is required for local/cloud agent development.
- Do not put long-running `next dev` in install/update scripts — start it only when testing the app.
