# GCP deployment guide for Grok / autonomous agents

**Audience:** Grok or any autonomous deployment agent configuring Google Cloud to run **BHC** (BH Contracting Co. CRM) from this repository with full API connectivity.

**Repository:** `GemsNS/BHC` · **Package manager:** npm · **Runtime:** Node.js 20+ · **Framework:** Next.js 15 (App Router)

**Read first:** `CLAUDE.md` → `docs/HANDOFF.md` → `docs/ARCHITECTURE.md` → `docs/API.md`

---

## 1. Mission

Deploy a **Node (full-stack) instance** of BHC on Google Cloud. The deployment must:

1. Serve the Next.js app over HTTPS with a stable public URL.
2. Keep **all `/api/*` routes** alive (not static export).
3. Persist `data/store.json` across restarts and redeploys.
4. Allow **outbound HTTPS** to third-party APIs the app calls at runtime.
5. Inject server secrets via GCP Secret Manager or Cloud Run env (never commit `.env`).

**Do not** deploy the GitHub Pages static build (`npm run build:gh-pages`) as the production GCP target. That mode strips API routes and uses browser `localStorage` only.

---

## 2. Product scope (what you are hosting)

BHC is a single Next.js application that combines:

| Surface | Paths | Needs API |
|---------|-------|-----------|
| Public marketing site | `/`, `/residential`, `/commercial`, `/showcase` | Optional (`/api/contact`) |
| Staff login | `/login` | Yes (`/api/auth/login`) |
| Admin CRM / ops | `/admin/*` | Yes |
| Field PWA apps | `/apps/*` | Yes |
| Mainframe AI assistant | `/admin/assistant` | Yes (`/api/ai/*`) |
| Active Knocker (canvassing) | `/admin/knocker`, `/apps/knocker` | Yes (`/api/knocker`) |
| Books & QuickBooks P&L | `/admin/books` | Yes (`/api/quickbooks/*`) |
| Market terminal | `/admin/markets` | Yes (`/api/markets` + external feeds) |

**Persistence model:** one JSON document at `data/store.json` (gitignored). No Postgres/MySQL in this repo. The server creates and migrates this file on first boot via `readStore()` in `src/lib/store.ts`.

**Auth model (demo):** PIN login; session is `localStorage` user id (`bhc-auth-user-id`). Treat internet-facing deploys as **trusted staff VPN or add auth hardening** before wide exposure.

**Demo logins (seed data):**

| Role | Login | PIN |
|------|-------|-----|
| Admin | `cameron` | `1001` |
| Knocker | `jamie` | `1007` |
| Field | `sam` | `1003` |
| Driver | `riley` | `1005` |

---

## 3. Deployment mode matrix

| Mode | Build command | APIs | Persistence | Use on GCP |
|------|---------------|------|-------------|------------|
| **Node full stack** | `npm ci && npm run build` | All `/api/*` | `data/store.json` on disk | **Yes — production** |
| Static GitHub Pages | `npm run build:gh-pages` | None | `localStorage` | **No** (demo only) |

**GCP env flags for Node mode:**

- Do **not** set `NEXT_PUBLIC_STATIC_DEMO=1`
- Do **not** set `NEXT_PUBLIC_BASE_PATH` unless serving under a subpath (default: root `/`)
- Set `PORT` to the container listen port (Cloud Run injects `8080`)

---

## 4. Recommended GCP architecture

### Option A — Cloud Run (recommended default)

- **Service:** Cloud Run (gen2) running the Docker image from `deploy/gcp/Dockerfile`
- **Ingress:** HTTPS load balancer or Cloud Run default URL + custom domain
- **Secrets:** Secret Manager → env vars at deploy time
- **Persistence:** one of:
  - **Filestore (NFS)** volume mounted at `/app/data` (best fit, no code changes)
  - **GCE VM** with persistent disk if Filestore is overkill (see Option B)
  - **Ephemeral disk** only for throwaway demos (data lost on scale-to-zero / redeploy)

### Option B — Compute Engine VM

- Ubuntu 22.04+, Node 20, `npm ci && npm run build && npm start`
- Attach **persistent disk** mounted at `/var/bhc/data` → symlink or `DATA_DIR` (today code uses `process.cwd()/data`; mount or bind at app `data/`)
- Nginx/Caddy reverse proxy + Let's Encrypt
- Simpler persistence story; you manage OS patches

### Option C — GKE

- Same container as Cloud Run; StatefulSet + PVC for `data/`
- Use only if the org already runs Kubernetes

**Agent default:** implement **Option A (Cloud Run + Filestore volume)** unless the user specifies VM-only.

---

## 5. Outbound connectivity (egress allowlist)

The app makes **server-side** `fetch()` calls. Ensure VPC egress / firewall / Cloud NAT allows HTTPS to:

| Destination | Purpose | Required |
|-------------|---------|----------|
| `generativelanguage.googleapis.com` | Gemini AI (Mainframe, summarize) | If `GEMINI_API_KEY` set |
| `api.openai.com` (or `OPENAI_BASE_URL`) | OpenAI fallback | If `OPENAI_API_KEY` set |
| `oauth.platform.intuit.com` | QuickBooks OAuth token refresh | If QuickBooks enabled |
| `quickbooks.api.intuit.com` | QuickBooks production API | `QUICKBOOKS_ENV=production` |
| `sandbox-quickbooks.api.intuit.com` | QuickBooks sandbox API | `QUICKBOOKS_ENV=sandbox` |
| `api.resend.com` | Contact form email | If `RESEND_API_KEY` set |
| `api.open-meteo.com` | Weather on marketing / markets | Public pages (optional) |
| `query1.finance.yahoo.com` | Market ticker data | `/admin/markets` |
| **Customer webhook URLs** | Outbound knocker events | When staff configure webhooks |
| `tile.openstreetmap.org` | Map tiles | Browser-side (user egress) |

**Inbound:** HTTPS `443` (and `80` → redirect) to the app. No special inbound webhooks from Intuit are required for the current QuickBooks flow (refresh-token based).

If the org uses **VPC Service Controls** or a restrictive egress policy, add the domains above before declaring deploy failed.

---

## 6. Environment variables

Copy from `.env.example`. Inject via Secret Manager on Cloud Run.

### Required for a useful production deploy

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Google AI Studio key for server Mainframe + summarize (preferred) |
| `GEMINI_MODEL` | Default `gemini-3.6-flash` |

### QuickBooks (payroll / books — Node host only)

| Variable | Description |
|----------|-------------|
| `QUICKBOOKS_CLIENT_ID` | Intuit app client id |
| `QUICKBOOKS_CLIENT_SECRET` | Intuit app secret |
| `QUICKBOOKS_REALM_ID` | Company realm id |
| `QUICKBOOKS_REFRESH_TOKEN` | OAuth refresh token (rotate when Intuit reissues) |
| `QUICKBOOKS_ENV` | `sandbox` or `production` |

Staff can also paste credentials in `/admin/books` (browser `localStorage`); **server env is preferred** for headless Mainframe `qb_*` tools and stable ops.

Obtain tokens via Intuit Developer OAuth playground or your OAuth app; this repo does not ship an OAuth redirect route yet.

### Optional

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Fallback LLM |
| `OPENAI_BASE_URL` | Default `https://api.openai.com/v1` |
| `OPENAI_MODEL` | Default `gpt-4o-mini` |
| `AI_PROVIDER` | Force `gemini` or `openai` |
| `RESEND_API_KEY` | Contact form |
| `CONTACT_TO_EMAIL` | Inbound address |
| `RESEND_FROM_EMAIL` | From header |
| `NEXT_PUBLIC_CONTACT_API_URL` | Override contact API URL if form posts cross-origin |
| `PORT` | Listen port (Cloud Run sets `8080`) |

### Do NOT set in production

| Variable | Why |
|----------|-----|
| `NEXT_PUBLIC_GEMINI_API_KEY` | Exposes key in JS bundle |
| `NEXT_PUBLIC_STATIC_DEMO=1` | Disables API routes in build |
| `NEXT_PUBLIC_BASE_PATH` | Only for nested GitHub Pages demo |

---

## 7. Build & run commands (from repo root)

```bash
npm ci
npm run build          # next build — includes API routes
npm start              # next start — bind 0.0.0.0:$PORT
```

**Quality gates before deploy:**

```bash
npm test
npm run lint
npm run build
```

**Health checks after deploy:**

```bash
curl -sS "https://<YOUR_HOST>/api/ai/status"
curl -sS "https://<YOUR_HOST>/api/store" | head -c 200
```

Expected `GET /api/ai/status`:

```json
{ "provider": "gemini", "configured": true, "model": "gemini-3.6-flash", ... }
```

---

## 8. Cloud Run runbook (step-by-step for agents)

Artifacts live in `deploy/gcp/`:

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage production image |
| `cloudbuild.yaml` | Cloud Build → Artifact Registry → Cloud Run |
| `service.yaml.example` | Cloud Run service template (env, volume, probes) |
| `.dockerignore` | Keep image small |

### 8.1 Prerequisites (gcloud)

```bash
export PROJECT_ID="your-gcp-project"
export REGION="us-central1"
export SERVICE_NAME="bhc"
export AR_REPO="bhc"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com file.googleapis.com
```

### 8.2 Secrets

```bash
# Example — repeat for each secret
echo -n "YOUR_GEMINI_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-
```

Grant Cloud Run service account `roles/secretmanager.secretAccessor` on each secret.

### 8.3 Build & push image

```bash
gcloud builds submit --config deploy/gcp/cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_AR_REPO="$AR_REPO",_SERVICE_NAME="$SERVICE_NAME"
```

Or local Docker:

```bash
docker build -f deploy/gcp/Dockerfile -t bhc:latest .
```

### 8.4 Filestore volume (persistent `data/`)

```bash
gcloud filestore instances create bhc-store \
  --zone="${REGION}-a" \
  --tier=BASIC_HDD \
  --file-share=name="vol1",capacity=1TB \
  --network=name="default"

# Note the mount IP, e.g. 10.0.0.2
```

Mount via Cloud Run volume (see `deploy/gcp/service.yaml.example`) at **`/app/data`**.

### 8.5 Deploy Cloud Run service

```bash
gcloud run deploy "$SERVICE_NAME" \
  --image "${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${SERVICE_NAME}:latest" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 4 \
  --set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --set-env-vars "GEMINI_MODEL=gemini-3.6-flash,QUICKBOOKS_ENV=production"
```

Add QuickBooks secrets the same way when configured.

**Custom domain:** map DNS → Cloud Run domain mapping; TLS is managed by Google.

### 8.6 Post-deploy verification

1. `GET /api/ai/status` → `configured: true`
2. `GET /login` → 200, staff login page
3. Login `cameron` / `1001` → `/admin/dashboard`
4. `/admin/assistant` → Mainframe responds (not LOCAL PARSER only)
5. `/admin/books` → Fetch QuickBooks P&L (if QB secrets set)
6. `/apps/knocker` → map loads (browser tiles)
7. Restart Cloud Run revision → data still present (Filestore mount)

---

## 9. Compute Engine runbook (alternative)

```bash
# On VM after git clone
sudo apt-get update && sudo apt-get install -y nodejs npm  # or nvm install 20
cd /opt/bhc && git clone https://github.com/GemsNS/BHC.git .
npm ci && npm run build

# Persistent data
sudo mkdir -p /var/bhc/data
sudo ln -sf /var/bhc/data /opt/bhc/data

# systemd unit /etc/systemd/system/bhc.service
# EnvironmentFile=/etc/bhc.env
# WorkingDirectory=/opt/bhc
# ExecStart=/usr/bin/npm start
# Restart=always

sudo systemctl enable --now bhc
```

Put Caddy/Nginx in front on `:443` proxying to `127.0.0.1:3000`.

---

## 10. API surface the host must serve

All routes under `src/app/api/` (37 handlers). Critical groups:

| Group | Paths |
|-------|-------|
| Store | `GET/PUT /api/store`, `POST /api/seed` |
| Auth | `POST /api/auth/login` |
| AI | `/api/ai/status`, `/api/ai/chat`, `/api/ai/summarize`, `/api/assistant` |
| Knocker | `GET/POST /api/knocker` |
| QuickBooks | `POST /api/quickbooks/pnl` (+ `/api/quickbooks/action` when merged) |
| Webhooks | `/api/webhooks` |
| Calendar | `GET /api/calendar` (ICS) |
| CRM | `/api/leads`, `/api/jobs`, `/api/crm`, `/api/invoices`, `/api/shifts`, … |

Full table: `docs/API.md`.

---

## 11. Coexistence with GitHub Pages demo

The static demo at `https://gemsns.github.io/BHC/` can remain for marketing demos.

| Concern | Production GCP | GitHub Pages |
|---------|----------------|--------------|
| Data | Shared `data/store.json` on server | Isolated per browser |
| APIs | Live | None |
| AI keys | Server `GEMINI_API_KEY` | Browser paste / build-time public key |
| QuickBooks | Server env + API routes | Not available |

Point staff to the **GCP URL** for real ops. Optionally set `NEXT_PUBLIC_CONTACT_API_URL=https://your-run-url/api/contact` on Pages build if the public site should hit GCP for contact form only.

---

## 12. Backup & disaster recovery

```bash
# Backup store (run on VM or Cloud Run exec / sidecar)
cp data/store.json "store-$(date -u +%Y%m%dT%H%M%SZ).json"
gsutil cp data/store.json gs://YOUR_BUCKET/backups/
```

Schedule daily GCS backup of `data/store.json`. Restore by replacing the file and restarting the service.

Reset to seed: `POST /api/seed` (destructive).

---

## 13. Security checklist for agents

- [ ] TLS on public URL
- [ ] Secrets in Secret Manager, not in image or git
- [ ] Restrict Cloud Run ingress (`--no-allow-unauthenticated`) + IAP or VPN if possible
- [ ] Do not set `NEXT_PUBLIC_GEMINI_API_KEY` in production builds
- [ ] Plan PIN → SSO / httpOnly cookie hardening before public internet
- [ ] Rotate `QUICKBOOKS_REFRESH_TOKEN` when Intuit invalidates
- [ ] Log scrubbing: never log API keys or QB client secret

---

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| 404 on `/api/*` | Static export build or API folder missing | Rebuild without `NEXT_PUBLIC_STATIC_DEMO` |
| Mainframe shows LOCAL PARSER | No `GEMINI_API_KEY` on server | Set secret, redeploy |
| Gemini 404 model | Deprecated model name | Use `gemini-3.6-flash` (`GEMINI_MODEL`) |
| QB token refresh failed | Bad refresh token or egress blocked | Refresh token via Intuit; allow `oauth.platform.intuit.com` |
| Empty CRM after redeploy | No persistent volume | Mount Filestore at `/app/data` |
| Contact form fails | No Resend key | Set `RESEND_API_KEY` or disable form |
| Webhooks fail outbound | Egress deny to customer URL | Allow HTTPS to configured webhook hosts |

---

## 15. Intentional backlog (do not block deploy)

Documented future work — **not required** for initial GCP bring-up:

1. Postgres / object storage instead of JSON file
2. Google Calendar OAuth `events.insert`
3. Web Push VAPID keys
4. httpOnly session cookies / PIN lockout
5. Multi-tenant isolation

See `docs/HANDOFF.md`.

---

## 16. Agent completion checklist

- [ ] Node full-stack image built from `main` (or specified branch)
- [ ] `data/` persisted across restart
- [ ] All secrets injected
- [ ] Egress allowlist applied
- [ ] Health endpoints return 200
- [ ] Staff login + dashboard verified
- [ ] AI status shows configured provider
- [ ] QuickBooks P&L tested (if credentials provided)
- [ ] Backup job for `data/store.json` scheduled
- [ ] Custom domain + TLS (if requested)

**Done when:** a staff user can log in, use Mainframe with server AI, mutate CRM data that survives redeploy, and QuickBooks/egress-dependent features work from the GCP URL.
