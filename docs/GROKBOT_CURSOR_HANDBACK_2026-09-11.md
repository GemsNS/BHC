# Grokbot → Cursor handback — BHC production (2026-09-11 / 12)

**Repo:** GemsNS/BHC · **Host:** bhc-app-1 (`bhc-production`, 34.170.129.15) · **App:** `/opt/bhc` · **Site:** https://bhcontracting.ca  
**Live SHA:** `83e32f8` · **Service user:** `www-data` (no Linux user `bhc`) · **Unit:** `bhc`  
**Do not re-seed production CRM.**

Synced into git so Cursor starts from live prod, not stale “ships off” docs.

---

## Snapshot (verified this handback)

| Area | State |
|------|--------|
| Health | ok — AI anthropic, mail smtp, scheduler on |
| Twilio | `TWILIO_ENABLED=1` · +19028134741 · webhooks → `/api/sms/inbound`, `/api/voice/inbound` |
| Outreach autosend | **ON** — `OUTREACH_AUTOSEND=email,sms` (min score default 75, cap 25/day, SMS quiet 21–8h) |
| Agent harness | `AGENT_HARNESS_ENABLED=1` · `auto-agent-ops` ON · actor `emp-mainframe-agent` · Anthropic direct (`claude-opus-5`) |
| God's Eye | `GODS_EYE_ENABLED=1` + public flag · embed **HRM-themed** GEV sibling |
| GEV sibling | `gods-eye-view.service` · Node 24 nvm · static dist on `127.0.0.1:4173` · https://gev.bhcontracting.ca 200 |
| Ads inbound | `ADS_INBOUND_SECRET` set · `POST /api/ads/inbound` (`x-bhc-inbound-secret` or `?secret=`) |
| GEV→CRM webhook | `GODS_EYE_WEBHOOK_SECRET` · `POST /api/gods-eye/webhook` (`x-bhc-gods-eye-secret`) · middleware allowlisted on main |
| SPF/DMARC | GoDaddy: SPF includes Outlook + secureserver; DMARC `p=reject` |
| Still off / pending | `OUTREACH_AUTOSEND_TOUCHES` unset · `REVIEW_URL` · Stripe LIVE · Cesium/Google photoreal keys |

### Flags (redacted)

```bash
AI_PROVIDER=anthropic
ANTHROPIC_MODEL=claude-opus-5
TWILIO_ENABLED=1
GODS_EYE_ENABLED=1
NEXT_PUBLIC_GODS_EYE_ENABLED=1
OUTREACH_AUTOSEND=email,sms
# Quote the hash — bare # is a shell/env comment
GODS_EYE_EMBED_URL="https://gev.bhcontracting.ca/#lat=44.6488&lon=-63.5752&alt=65000&heading=0&pitch=-55&map=esri-imagery"
NEXT_PUBLIC_GODS_EYE_EMBED_URL="$GODS_EYE_EMBED_URL"
AGENT_HARNESS_ENABLED=1
AGENT_HARNESS_MAX_STEPS=8
```

Keep `/etc/bhc/bhc.env` (systemd) and `/opt/bhc/.env` (Next build / `NEXT_PUBLIC_*`) in sync. `NEXT_PUBLIC_*` needs rebuild.

---

## Deploy (always)

```bash
cd /opt/bhc
# Default in repo deploy script is now www-data — still safe to export explicitly:
export BHC_APP_USER=www-data BHC_APP_GROUP=www-data
bash deploy/production/deploy.sh                       # origin/main
```

After copying updated unit files from the repo:

```bash
sudo cp deploy/production/bhc.service /etc/systemd/system/bhc.service
sudo systemctl daemon-reload && sudo systemctl restart bhc
```

---

## Twilio

- Account restored; leave `TWILIO_ENABLED=1`.
- Number webhooks already pointed at prod SMS/Voice inbound routes.
- Quiet hours still apply for SMS autosend (21–8).

## Outreach autosend

```bash
OUTREACH_AUTOSEND=email,sms
# optional later: OUTREACH_AUTOSEND_TOUCHES=1  # review/referral/payment touches
```

Policy (code): high-score ad replies can send without manual approve; daily cap 25; `ADS_AUTOSEND_MIN_SCORE` default 75.  
**Harness cannot call `send_outreach` / approve tools** — humans or the outreach-send automation path only.

## Agent harness ↔ Anthropic

- `AI_PROVIDER=anthropic` · `ANTHROPIC_API_KEY` present · no `ANTHROPIC_BASE_URL` (AgentRouter abandoned).
- Kill-switch `AGENT_HARNESS_ENABLED=1` + UI automation `auto-agent-ops`.
- Allowlisted reads/reversible writes only; deletes / send / approve outreach refused.

```bash
sudo -u www-data bash -lc 'cd /opt/bhc && set -a && source /etc/bhc/bhc.env && set +a && ./node_modules/.bin/tsx scripts/bhc-cli.ts automations tick --force'
```

## God's Eye View (HRM)

CRM tab: Admin → God's Eye View (`/admin/gods-eye`).

- Sibling: `/opt/gods-eye-view` · systemd `gods-eye-view` · Apache `gev.bhcontracting.ca` (TLS) · `frame-ancestors` allows `bhcontracting.ca`.
- HRM camera: embed URL share hash `#lat=44.6488&lon=-63.5752&alt=65000&pitch=-55&map=esri-imagery&…`
- **Quote the value in env files** (`#` is a comment otherwise). Bare gev URL also injects the same HRM default via `serve-dist.mjs`.
- Fallback: keyless Leaflet Esri/OSM (HRM-centered) if embed down.
- Webhook: GEV events → `POST https://bhcontracting.ca/api/gods-eye/webhook` + `x-bhc-gods-eye-secret`.
- Photoreal: optional `CESIUM_ION_TOKEN` / `GOOGLE_MAPS_API_KEY` in `/etc/gods-eye-view/env` (not required for Esri/OSM).
- License: GEV MIT; strip/review TeleGeography NonCommercial layers before commercial emphasis.

## Ads / leads

```bash
sudo -u www-data bash -lc 'cd /opt/bhc && set -a && source /etc/bhc/bhc.env && set +a && ./node_modules/.bin/tsx scripts/bhc-cli.ts ads ensure-sources && ./node_modules/.bin/tsx scripts/bhc-cli.ts ads ingest && ./node_modules/.bin/tsx scripts/bhc-cli.ts ads status'
```

Kijiji HTML + IMAP Gmail alerts primary; Reddit/Craigslist often 403/429 from GCP.

## Open / do not

- Do **not** re-seed prod.
- Do **not** vendor full Cesium into Next 15.
- `REVIEW_URL` after Google Business Profile public.
- Stripe LIVE when ops ready (test key may already exist).
- Prefer `BHC_APP_USER=www-data` on every deploy (now the script default).

## Kill-switches

| System | Off |
|--------|-----|
| Twilio | `TWILIO_ENABLED=0` + restart |
| Harness | `AGENT_HARNESS_ENABLED=0` and/or disable `auto-agent-ops` |
| GEV CRM tab | `GODS_EYE_ENABLED=0` + `NEXT_PUBLIC_GODS_EYE_ENABLED=0` + rebuild |
| GEV sibling | `systemctl stop gods-eye-view` |
| Autosend | `OUTREACH_AUTOSEND=` (empty) + restart |

— Grok Bot (Server Setup Bot), 2026-09-11/12 America/Halifax · ingested into git for Cursor
