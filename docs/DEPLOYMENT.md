# Deployment

## Environments

### 1. Local full stack (recommended for development)

```bash
npm install
cp .env.example .env   # add secrets locally, never commit
npm run dev
```

Open http://localhost:3000 → `/login`.

Production-like:

```bash
npm run build
npm start              # 0.0.0.0:3000
```

Data: `data/store.json` (created on first read). Reset: `POST /api/seed`.

### 2. GitHub Pages static demo

```bash
npm run deploy:gh-pages
```

Script: `scripts/build-gh-pages.sh` temporarily moves `src/app/api`, sets `NEXT_PUBLIC_STATIC_DEMO=1` and `NEXT_PUBLIC_BASE_PATH=/BHC`, exports `out/`, then `scripts/deploy-gh-pages.sh` publishes branch `gh-pages`.

Enable Pages on `gh-pages` branch. URL: https://gemsns.github.io/BHC/

**Limitations:** no `/api/*`. Client uses localStorage. Calendar ICS download still works client-side. Webhooks require a Node host. Browser AI: paste key on `/admin/assistant` or set `NEXT_PUBLIC_GEMINI_API_KEY` at **build time** (visible in JS — testing only).

### 3. Node host (Fly, Railway, VPS, Cloud Run, **Google Cloud**)

- Node 20+
- `npm ci && npm run build && npm start` (listens on `$PORT`, default `3000`)
- Persist `data/` as a volume (`data/store.json` is the CRM database)
- Set env vars from `.env.example`
- Put a reverse proxy (TLS) in front
- **Do not expose this demo auth model to the public internet without hardening**

**Google Cloud (Grok / autonomous agents):** see [`docs/GCP_GROK_DEPLOY.md`](./GCP_GROK_DEPLOY.md) and `deploy/gcp/` (Dockerfile, Cloud Build, Cloud Run example). Covers egress allowlist, Secret Manager, Filestore persistence, and QuickBooks connectivity.

## Environment variables

| Variable | Used by | Notes |
|----------|---------|-------|
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Server AI | Preferred. Header `x-goog-api-key` |
| `GEMINI_MODEL` | Server AI | default `gemini-2.0-flash` |
| `NEXT_PUBLIC_GEMINI_API_KEY` | Browser AI | **insecure**, Pages testing |
| `NEXT_PUBLIC_GEMINI_MODEL` | Browser AI | |
| `OPENAI_API_KEY` | Server AI fallback | |
| `OPENAI_BASE_URL` / `OPENAI_MODEL` | OpenAI-compatible | |
| `AI_PROVIDER` | Force `gemini` or `openai` | |
| `NEXT_PUBLIC_STATIC_DEMO` | Static export | `1` |
| `NEXT_PUBLIC_BASE_PATH` | Nested hosting | `/BHC` |
| `RESEND_API_KEY` | Contact form | optional |
| `QUICKBOOKS_CLIENT_ID` | QuickBooks Online | Node host; with secret, realm, refresh token |
| `QUICKBOOKS_CLIENT_SECRET` | QuickBooks Online | |
| `QUICKBOOKS_REALM_ID` | QuickBooks Online | |
| `QUICKBOOKS_REFRESH_TOKEN` | QuickBooks Online | Rotates on refresh |
| `QUICKBOOKS_ENV` | QuickBooks Online | `sandbox` or `production` |
| `GOOGLE_CALENDAR_CLIENT_ID` | Future OAuth | unused until OAuth implemented |
| `WEBHOOK_RETRY` | Future | not wired |

## PWA / mobile

- Manifest: `public/manifest.webmanifest`
- Service worker: `public/sw.js` (registered in root layout)
- Add to Home Screen for standalone knocker
- Grant Location + Notifications on first canvassing session
- iOS: background GPS is best-effort; keep the PWA in foreground for continuous breadcrumbs

## Health checks

- `GET /api/ai/status` — AI configured?
- `GET /api/store` — store readable?
- `npm run bhc -- store summary`

## Rollback

Pages: revert `gh-pages` branch. App: revert `main` and redeploy. Store file is independent — keep backups of `data/store.json`.
