# AGENTS.md

## Cursor Cloud specific instructions

- Single Next.js app at repo root. Package manager: **npm** (`package-lock.json`).
- Dev server: `npm run dev` (binds `0.0.0.0:3000`).
  - Admin: `/admin/dashboard` · Zones: `/admin/zones` · Apps: `/apps` · Knocker: `/apps/knocker`
- Lint / test / build: `npm run lint`, `npm test`, `npm run build` (see `package.json` / `README.md`).
- Persistence: `data/store.json` (gitignored), auto-seeded; reset with `POST /api/seed`. No external DB required.
- Static GitHub Pages demo: `npm run build:gh-pages` (temporarily moves `src/app/api`, sets `NEXT_PUBLIC_STATIC_DEMO=1` + `NEXT_PUBLIC_BASE_PATH=/BHC-ALL-IN-ONE`). Client falls back to localStorage. Deploy with `npm run deploy:gh-pages`.
- Do not put long-running `next dev` in install/update scripts.
