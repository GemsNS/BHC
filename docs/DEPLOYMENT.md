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

### 3. Production — bhcontracting.ca (Node host, systemd)

Layout on the host: app in `/opt/bhc`, service unit `bhc`, store in `/opt/bhc/data` (persisted across deploys), TLS at the reverse proxy.

**One-time setup**

```bash
sudo cp deploy/production/bhc.service /etc/systemd/system/bhc.service
sudo systemctl daemon-reload && sudo systemctl enable --now bhc
# optional: external timer instead of the in-process scheduler (then set BHC_SCHEDULER=0 in .env)
sudo cp deploy/production/bhc-automation.{service,timer} /etc/systemd/system/
sudo systemctl enable --now bhc-automation.timer
```

Add to `/opt/bhc/.env`: `AUTOMATION_SECRET=<long random>` (lets cron/CI trigger ticks) and any `AUTOMATION_*` thresholds.

**Every release** — from the host:

```bash
cd /opt/bhc && bash deploy/production/deploy.sh          # deploy origin/main
bash deploy/production/deploy.sh --ref v0.3.0            # a tag or sha
bash deploy/production/deploy.sh --rollback              # previous release
```

The script snapshots `data/store.json` to `data/backups/pre-deploy-*.json`, fetches, runs `npm ci` only if `package-lock.json` changed, builds to a side directory and swaps it in, restarts `bhc`, waits for `GET /api/health` = 200, and **rolls back automatically** if the health check fails. It then runs one automation tick so the new code's checks/backups execute immediately. Log: `data/deploy/deploy.log`.

**From your workstation**

```bash
npm run release              # verify (lint+typecheck+test+build) → git push origin main → CI → Deploy production (Actions)
npm run release -- --ssh     # same, then run deploy.sh over SSH (PROD_SSH=user@host)
```

**GitHub Actions** (`.github/workflows/`):

| Workflow | Trigger | Does |
|----------|---------|------|
| `ci.yml` | every push / PR | lint, typecheck, test, build, engine smoke |
| `deploy-production.yml` | CI success on `main`, or manual | SSH → `deploy.sh`, then public health check. **No-op until secrets exist:** `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY` (+ optional `PROD_SSH_PORT`, `PROD_APP_DIR`) |
| `nightly.yml` | 06:15 UTC daily | health probe + automation tick via `AUTOMATION_SECRET` |
| `gh-pages.yml` | manual | static demo → `gh-pages` |

Generic Node hosts (Fly, Railway, Cloud Run): `npm ci && npm run build && npm start`, persist `data/`, set env from `.env.example`, TLS in front. **Do not expose the current auth model without hardening** (see backlog).

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
| `RESEND_API_KEY` | Contact form (Resend) | Alternative to SMTP |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | Contact form (GoDaddy etc.) | See `docs/GODADDY_EMAIL_SETUP.md` |
| `SMTP_USER` / `SMTP_PASS` | SMTP auth | GoDaddy mailbox email + password |
| `SMTP_FROM` / `CONTACT_TO_EMAIL` | Contact form routing | From / to addresses |
| `GOOGLE_CALENDAR_CLIENT_ID` | Future OAuth | unused until OAuth implemented |
| `APP_BASE_URL` | QuickBooks OAuth | e.g. `https://bhcontracting.ca` |
| `QUICKBOOKS_CLIENT_ID` | QuickBooks OAuth | Intuit production app |
| `QUICKBOOKS_CLIENT_SECRET` | QuickBooks OAuth | **server only, never commit** |
| `QUICKBOOKS_ENV` | QuickBooks API host | `production` or `sandbox` |
| `QUICKBOOKS_REDIRECT_URI` | OAuth callback | `https://bhcontracting.ca/api/quickbooks/callback` |
| `BHC_SCHEDULER` / `BHC_SCHEDULER_INTERVAL_MIN` | Automation scheduler | default on, every 15 min (`docs/AUTOMATION.md`) |
| `AUTOMATION_SECRET` | `POST /api/automation` from cron/CI | header `x-bhc-automation-secret` |
| `BHC_BACKUP_KEEP` | Nightly store backups | default 14 snapshots |
| `AUTOMATION_*` thresholds | Ops checks | invoice due days, job silent days, tool max days, … |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` / `ANTHROPIC_FAST_MODEL` | Mainframe AI + ad triage | defaults `claude-opus-5` / `claude-haiku-4-5` |
| `ADS_IMAP_*`, `ADS_INBOUND_SECRET`, `ADS_MIN_SCORE` | Job-ad intake | `docs/OUTREACH.md` |
| `OUTREACH_AUTOSEND`, `OUTREACH_DAILY_CAP`, `OUTREACH_QUIET_HOURS`, `OUTREACH_*` signature | Cold email/SMS sending | approval-first by default |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | SMS out + `/api/sms/inbound` | Canadian 902 number |
| `DIGEST_EMAIL_TO` | Daily digest email | optional |

## PWA / mobile

- Manifest: `public/manifest.webmanifest`
- Service worker: `public/sw.js` (registered in root layout)
- Add to Home Screen for standalone knocker
- Grant Location + Notifications on first canvassing session
- iOS: background GPS is best-effort; keep the PWA in foreground for continuous breadcrumbs

## Health checks

- `GET /api/health` — public, secret-free: store ok, scheduler state, AI/mail provider names. 200 or 503. Use for uptime monitors.
- `GET /api/automation` — (admin) scheduler, due automations, recent ticks, backups, store health
- `GET /api/ai/status` — AI configured?
- `npm run bhc -- store health` · `npm run bhc -- automations status`

## Backups & rollback

- Nightly: `store_backup` automation → `data/backups/store-*.json` (keeps `BHC_BACKUP_KEEP`, default 14)
- Every deploy: `data/backups/pre-deploy-*.json` (last 10)
- Manual: `npm run bhc -- store backup` · restore with `npm run bhc -- store restore <file>` (takes a `pre-restore-*` copy first) or Automation hub → Restore (admin)
- App rollback: `bash deploy/production/deploy.sh --rollback` (previous SHA recorded in `data/deploy/previous_sha`)
- Pages: revert `gh-pages` branch.
