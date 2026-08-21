# AGENTS.md

## Cursor Cloud specific instructions

- Single Next.js app at repo root. Package manager: **npm** (`package-lock.json`).
- Dev server: `npm run dev` (binds `0.0.0.0:3000`).
  - Login: `/login` · Admin: `/admin/dashboard` · Board: `/admin/board` or `/apps/board` · Apps: `/apps` · Knocker: `/apps/knocker`
- Lint / test / build: `npm run lint`, `npm test`, `npm run build` (see `package.json` / `README.md`).
- Persistence: `data/store.json` (gitignored), auto-seeded; reset with `POST /api/seed`. No external DB required.
- Auth: every employee has `login` + `pin`. Session is client-side (`bhc-auth-user-id`). Role permissions gate nav and routes.
- Demo logins: `jordan`/`1001` (admin), `jamie`/`1007` (knocker), `sam`/`1003` (field), `riley`/`1005` (driver).
- Repo: `GemsNS/BHC` · Pages demo base path `/BHC`
- Static GitHub Pages demo: `npm run build:gh-pages` (temporarily moves `src/app/api`, sets `NEXT_PUBLIC_STATIC_DEMO=1` + `NEXT_PUBLIC_BASE_PATH=/BHC`). Client falls back to localStorage. Deploy with `npm run deploy:gh-pages`.
- Do not put long-running `next dev` in install/update scripts.
- User preference: merge completed feature PRs into `main` after verification.
