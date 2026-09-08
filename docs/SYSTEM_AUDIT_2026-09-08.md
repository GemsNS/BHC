# System audit — pipeline crash + setup gaps (2026-09-08)

## Pipeline crash (fixed)

**Symptom:** Dashboard/summary shows N leads (e.g. 7), opening **Sales → Pipeline** (`/admin/sales`) white-screens / crashes.

**Root cause:** `PipelinePanel` used bare `fetch("/api/leads")` + `fetch("/api/crm")` without session headers / `fetchJson`, then did `deals.filter(...)` on whatever came back. After cookie auth landed, unauthenticated or error JSON (`{ error: "Unauthorized…" }`) has no `deals` / `leads` arrays → `Cannot read properties of undefined (reading 'filter')`.

Summary counts still worked because the dashboard uses `loadAppData()` (attaches `x-bhc-user-id` / store path).

**Fix (this branch):**
- `PipelinePanel` now hydrates via `loadAppData()`, refreshes with `fetchJson`, never sets arrays to `undefined`, shows an error banner instead of crashing.
- `normalizeStore` hardens deal `stage` / `amount` / `title`.

**Deploy required** for production to pick this up.

**Immediate workaround before deploy:** hard-refresh, log out, log in again at `/login` (restores `bhc_session` cookie), then reopen Pipeline.

---

## Production health snapshot (public probe)

`GET https://bhcontracting.ca/api/health` (observed 2026-09-08):

| Check | Status |
|-------|--------|
| Service | ok (`bhc` 0.2.0) |
| Store | ok, backend `json`, **1 issue** (detail not public; check `npm run bhc -- store health` on host) |
| Scheduler | enabled, started, last tick recent |
| AI | **anthropic configured** |
| Mail | **smtp** configured |
| `SESSION_SECRET` warning | none on probe |
| Commit stamp | `null` (deploy script may not have set `BHC_COMMIT`) |

Unauthenticated API probes (expected 401 after auth hardening):
- `/api/leads`, `/api/crm`, `/api/stream`, `/api/automation` → 401

That 401 is also what crashed Pipeline when the browser had UI session (localStorage) but no valid API cookie/header on the bare fetch.

---

## What is already working (no purchase)

- Core CRM store + scheduler automations ticking
- SMTP mail path (GoDaddy likely)
- Anthropic/Claude path configured on server (AgentRouter or direct)
- Public site, login, admin shells
- Password presentations (Walid)
- Automation engine drafting (sends stay gated until autosend flags + Twilio)

---

## APIs / webhooks still missing or unverified

### Inbound webhooks to configure at providers

| Provider | URL | Status |
|----------|-----|--------|
| Twilio SMS | `https://bhcontracting.ca/api/sms/inbound` | **Blocked** until Twilio account reactivated + number webhooks pointed |
| Twilio Voice | `https://bhcontracting.ca/api/voice/inbound` (+ status/voicemail callbacks) | Same |
| Stripe | `https://bhcontracting.ca/api/payments/webhook` (`checkout.session.completed`, `checkout.session.async_payment_succeeded`) | **Missing** until Stripe keys + webhook secret in `.env` |
| Ads inbound (optional) | `https://bhcontracting.ca/api/ads/inbound` + `x-bhc-inbound-secret` | Optional (Zapier/Make) |
| Uptime monitor | `https://bhcontracting.ca/api/health` | Free — configure UptimeRobot if not done |
| GitHub Actions deploy | secrets `PROD_SSH_*` | Still unset → Actions deploy is a no-op; host deploy via SSH/script only |

### Outbound webhooks from BHC

| Preset | Purpose | Status |
|--------|---------|--------|
| `ops-alerts-discord` / `ops-alerts-slack` | Live alerts to phone/desktop | Optional free — create Discord webhook + `hooks add` |
| `crm-sync` | Mirror events to Zapier/sheets | Optional |
| `engine-health` | Tick pings | Optional |

### Env flags that turn “send” on (leave off until providers proven)

- `OUTREACH_AUTOSEND=email,sms`
- `DOCS_AUTOSEND=quote,receipt,job_report`
- `OUTREACH_AUTOSEND_TOUCHES=1`
- `BHC_STRICT_AUTH=1` (only after everyone has re-logged in with cookies)

---

## Still buy / finish (purchase & install list)

| Priority | Item | Why | Approx cost |
|----------|------|-----|-------------|
| 1 | **Deploy this pipeline fix** | Stops Sales crash | free |
| 2 | **Twilio account reactivation** (ticket #29410155) + 902 number | SMS/voice/inbox/missed-call | ~$5–15/mo once approved |
| 3 | Point Twilio Messaging + Voice webhooks at URLs above; set `TWILIO_*`, `VOICE_FORWARD_TO` | Makes inbox/voice live | included |
| 4 | **Stripe** account (test now, live when ready) + webhook | Card pay links / deposits | 2.9% + 30¢ / card |
| 5 | Confirm **IMAP** (`ADS_IMAP_*`) for Kijiji alerts + reply detection + e-Transfer match | Ad pipeline intake | free if mailbox already paid |
| 6 | Kijiji saved-search emails → CRM mailbox | Free lead intake | free |
| 7 | `REVIEW_URL` Google Business review link | Auto review asks | free |
| 8 | Discord/Slack ops webhook | Alerts without watching `/admin/live` | free |
| 9 | Optional: GitHub `PROD_SSH_*` secrets | Push-to-deploy | free |
| 10 | Optional: real Anthropic billing if AgentRouter credits run out | Mainframe quality long-term | ~$15–40/mo |

**Not required to “open Pipeline”:** Twilio, Stripe, Discord. Pipeline is pure CRM + auth.

---

## Live Wire reconnecting

`/api/stream` is cookie-gated (401 without session). If Live Wire flaps “reconnecting”, usually:
1. Missing/expired `bhc_session` → log out/in
2. Proxy buffering SSE (disable buffer for `/api/stream` on Apache/nginx)
3. Tab sleep / network blip (client reconnect is normal)

---

## Host commands after merging this fix

```bash
cd /opt/bhc
git pull origin main
npm ci   # only if lockfile changed
bash deploy/production/deploy.sh
npm run bhc -- store health
npm run console   # then: env
```

Then in the browser: log out → log in → open `/admin/sales`.
