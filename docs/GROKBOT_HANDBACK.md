# Grokbot handback — God's Eye View (full instance) + Mainframe agent harness

**Repo:** GemsNS/BHC · **Prod:** `/opt/bhc` · **Site:** bhcontracting.ca  
**CRM tab:** Admin → God's Eye View (`/admin/gods-eye`)  
**Automation:** Admin → Automation → “Mainframe ops sweep (AI agent)” (`agent_ops`)

**Twilio:** Account is **restored**. Wire SMS back on prod (`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER`, then `TWILIO_ENABLED=1`, webhook → `/api/sms/inbound`). Full steps in §3 below — do not leave SMS off assuming compliance is still pending.

This handback covers two ship-ready but **default-OFF** systems. CRM stays fully operational if either (or both) remain off.

Upstream GEV (MIT code, third-party **data** keeps own licenses):  
https://github.com/bilawalsidhu/gods-eye-view

---

## 0. Deploy BHC first (this PR)

```bash
cd /opt/bhc && bash deploy/production/deploy.sh
git -C /opt/bhc rev-parse --short HEAD
curl -sS http://127.0.0.1:3000/api/health
```

Confirm leads still tick (Kijiji demand sources already on main):

```bash
sudo -u bhc bash -lc 'cd /opt/bhc && npm run bhc -- ads ensure-sources && npm run bhc -- ads ingest && npm run bhc -- ads status'
sudo -u bhc bash -lc 'cd /opt/bhc && npm run bhc -- ads test-email <owner@bhcontracting.ca>'
```

SPF/DMARC were fixed on GoDaddy (Outlook include + `p=reject`). Re-check anytime:

```bash
dig +short TXT bhcontracting.ca | grep -i spf
dig +short TXT _dmarc.bhcontracting.ca
```

---

## 1. God's Eye View — full instance + CRM iframe

### What BHC already has

| Piece | Status |
|-------|--------|
| `/admin/gods-eye` tab | Shipped, **kill-switch default OFF** |
| Fallback Leaflet/Esri HRM map | Works keyless while GEV is down |
| Full-bleed **iframe** when `GODS_EYE_EMBED_URL` set | Primary UX |
| CSP `frame-src` allowlist for embed origin | Auto from env |
| Webhook sink `POST /api/gods-eye/webhook` | Secret-gated; writes owner notification |

### What Grokbot must deploy (sibling service)

Stand up **gods-eye-view** as its own Node process behind Apache, **not** inside Next.

Suggested layout on the VPS:

```text
/opt/gods-eye-view/          # cloned upstream
/etc/gods-eye-view/env       # secrets (not in git)
systemd: gods-eye-view.service  → 127.0.0.1:4173
Apache: https://gev.bhcontracting.ca/  → proxy to :4173
```

#### A. Install GEV

```bash
sudo mkdir -p /opt/gods-eye-view /etc/gods-eye-view
sudo git clone https://github.com/bilawalsidhu/gods-eye-view.git /opt/gods-eye-view
cd /opt/gods-eye-view
# Upstream wants Node 24+ — use nvm/fnm or NodeSource if host is older
node -v
npm ci
```

Create `/etc/gods-eye-view/env` (chmod 600). Reuse keys already on the BHC box where they exist:

```bash
# Photoreal / terrain (recommended for "real" GEV)
CESIUM_ION_TOKEN=<from ion.cesium.com — or copy CESIUM_ION_TOKEN / NEXT_PUBLIC_CESIUM_ION_TOKEN from /opt/bhc/.env if present>
# Optional Google photoreal / places (metered)
GOOGLE_MAPS_API_KEY=<from /opt/bhc/.env GOOGLE_MAPS_API_KEY / NEXT_PUBLIC_GOOGLE_MAPS_API_KEY if present>
# Optional voice / AI HUD inside GEV
OPENAI_API_KEY=<from /opt/bhc/.env if you use OpenAI there>
# Bind local only — Apache terminates TLS
HOST=127.0.0.1
PORT=4173
```

Build + systemd unit (example):

```ini
# /etc/systemd/system/gods-eye-view.service
[Unit]
Description=God's Eye View (HRM)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/gods-eye-view
EnvironmentFile=/etc/gods-eye-view/env
ExecStart=/usr/bin/npm run preview -- --host 127.0.0.1 --port 4173
Restart=on-failure
User=bhc
Group=bhc

[Install]
WantedBy=multi-user.target
```

```bash
cd /opt/gods-eye-view && npm run build
sudo systemctl daemon-reload
sudo systemctl enable --now gods-eye-view.service
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4173/
```

#### B. Apache vhost (gev.bhcontracting.ca)

- DNS: `gev` CNAME/A → same VPS  
- TLS: certbot  
- ProxyPass to `http://127.0.0.1:4173/`  
- **Do not** weaken BHC `frame-ancestors`; GEV is framed by BHC, not the reverse

#### C. HRM default camera

Configure GEV (POWER UP panel and/or share-link / startup query) for:

- Lat **44.6488**, Lon **-63.5752**, regional altitude / HRM overview  
- Prefer Halifax / HRM saved view if the build supports deep links — put that URL in BHC embed env (not just the bare origin)

#### D. Wire iframe + webhook into BHC

In `/opt/bhc/.env`:

```bash
GODS_EYE_ENABLED=1
NEXT_PUBLIC_GODS_EYE_ENABLED=1
GODS_EYE_EMBED_URL=https://gev.bhcontracting.ca/
NEXT_PUBLIC_GODS_EYE_EMBED_URL=https://gev.bhcontracting.ca/
GODS_EYE_WEBHOOK_SECRET=<openssl rand -hex 24>
# Optional soft-fail status chips (already used by BHC):
# CESIUM_ION_TOKEN=...
# NEXT_PUBLIC_CESIUM_ION_TOKEN=...
# GOOGLE_MAPS_API_KEY=...
# NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
```

Rebuild BHC (NEXT_PUBLIC_* is build-time):

```bash
cd /opt/bhc && bash deploy/production/deploy.sh
```

Point GEV outbound hooks (if/when configured in that app) at:

```text
POST https://bhcontracting.ca/api/gods-eye/webhook
Header: x-bhc-gods-eye-secret: <GODS_EYE_WEBHOOK_SECRET>
JSON: { "type": "contact.selected", "title": "...", "lat": 44.65, "lng": -63.57, "url": "..." }
```

Smoke:

```bash
curl -sS https://bhcontracting.ca/api/gods-eye/webhook
# open Admin → God's Eye View — expect full iframe, not just Leaflet
```

#### E. Kill-switch (CRM stays up)

```bash
GODS_EYE_ENABLED=0
NEXT_PUBLIC_GODS_EYE_ENABLED=0
# optional: stop the sibling
sudo systemctl stop gods-eye-view.service
```

Rebuild/restart BHC. Nav hides; other CRM routes untouched.

#### F. License / data notes for Grokbot

- GEV **code** is MIT; TeleGeography submarine cables etc. may be **NonCommercial** — strip or license before commercial use (see upstream DATA_SOURCES).  
- Prefer keyless Esri/OSM layers if keys are delayed; photoreal needs Cesium ion and/or Google.

---

## 2. Mainframe agent harness (`agent_ops`)

### What shipped

| Piece | Detail |
|-------|--------|
| Module | `src/lib/agent-harness.ts` |
| Automation | `agent_ops` / id `auto-agent-ops` — **defaultEnabled: false** |
| Scheduler | Wired in `runServerTick` → `agentOps` hook |
| Env kill-switch | `AGENT_HARNESS_ENABLED=0` (default) overrides UI toggle |
| Step cap | `AGENT_HARNESS_MAX_STEPS` (default ≤ 8) |
| Actor | `emp-mainframe-agent` (AI budget ledger) |
| Allowlist | reads + reversible writes only (`create_task`, `update_lead`, …) |
| Hard refuse | all `delete_*`, `send_outreach`, `approve_outreach`, `update_outreach`, `update_invoice`, `toggle_automation`, `run_daily_automations`, `import_data`, contracts, HR, etc. |
| Output | DID / NEEDS HUMAN / NOTED → audit + owner notification |

### Enable on prod (after AI key proven)

Reuse the **existing** AI key already on the box (do not invent a second vendor unless needed):

```bash
# /opt/bhc/.env — pick what is already present
# ANTHROPIC_API_KEY=...          # preferred (Mainframe)
# or GEMINI_API_KEY=...
# or OPENAI_API_KEY=...

AGENT_HARNESS_ENABLED=1
AGENT_HARNESS_MAX_STEPS=8
# Budget already enforced via AI_* limits — harness charges emp-mainframe-agent
```

```bash
sudo systemctl restart bhc
# Enable in UI: Admin → Automation → "Mainframe ops sweep (AI agent)" → ON
# Or force one run:
sudo -u bhc bash -lc 'cd /opt/bhc && npm run bhc -- automations tick --force'
```

### Safety checklist

- [ ] Leave catalog toggle **OFF** until a successful forced tick looks sane  
- [ ] Confirm refused tools never mutate (send/delete)  
- [ ] Confirm “needs human” creates an in-app notification  
- [ ] Keep `OUTREACH_AUTOSEND` off until email is proven (`ads test-email`)

### Disable instantly

```bash
AGENT_HARNESS_ENABLED=0
# and/or disable the automation in Admin → Automation
sudo systemctl restart bhc
```

---

## 3. Pre-existing keys map (do not recreate blindly)

| Purpose | Typical `/opt/bhc/.env` keys | Used by |
|---------|------------------------------|---------|
| Mainframe / harness AI | `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`) | CRM chat + `agent_ops` |
| Fallback AI | `GEMINI_API_KEY` / `OPENAI_API_KEY` | Same |
| Outbound email | `SMTP_*` or `RESEND_API_KEY` | Outreach / test-email |
| SMS (Twilio) | `TWILIO_*` + `TWILIO_ENABLED` | SMS out + `/api/sms/inbound` |
| Ads inbound | `ADS_INBOUND_SECRET` | FB sidecar + Zapier |
| GEV photoreal | `CESIUM_ION_TOKEN` | GEV sibling (+ BHC status) |
| GEV Google | `GOOGLE_MAPS_API_KEY` | GEV sibling |
| GEV → CRM webhook | `GODS_EYE_WEBHOOK_SECRET` | `/api/gods-eye/webhook` |

Copy into `/etc/gods-eye-view/env` only what GEV needs; never commit secrets.

### Twilio — account restored (wire it back in)

Twilio has **restored** the BHC account. Wire SMS on prod using keys already expected in `/opt/bhc/.env` (do not recreate the account):

```bash
# /opt/bhc/.env — confirm values match the restored Twilio console
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1902XXXXXXX          # Canadian 902 local
# TWILIO_MESSAGING_SERVICE_SID=MGxxxx    # optional, preferred once created
TWILIO_ENABLED=1                         # was 0 while suspended — flip on after smoke
# Webhook URL in Twilio console → https://bhcontracting.ca/api/sms/inbound
# TWILIO_INBOUND_URL / TWILIO_PUBLIC_BASE only if a proxy rewrites public URLs
```

```bash
sudo systemctl restart bhc
sudo -u bhc bash -lc 'cd /opt/bhc && npm run bhc -- status'   # expect SMS configured
# Optional: send a test SMS via CLI/console once FROM is verified
```

Keep agent harness **unable** to call `send_outreach` — humans still approve SMS/email sends. Leave `OUTREACH_AUTOSEND` off until a manual approved send looks good.

---

## 4. Acceptance

**God's Eye**

1. Kill-switch off → tab hidden / disabled panel; CRM otherwise fine  
2. Kill-switch on + no embed → HRM Leaflet fallback  
3. Embed URL set → full-bleed GEV iframe over HRM  
4. Webhook with secret → notification appears  

**Agent harness**

1. `AGENT_HARNESS_ENABLED=0` → skipped even if UI enabled  
2. Enabled + AI key → tick runs; forbidden tools refused  
3. NEEDS HUMAN → owner notification  

**Leads (Claude, already on main)**

1. `ads ensure-sources` shows Kijiji demand sources  
2. `ads ingest` / `ads status` healthy  
3. Optional FB timer only after ops session login  

---

## 5. Out of scope / do not do

- Do not vendor full Cesium GEV into the Next 15 app  
- Do not enable `OUTREACH_AUTOSEND` or harness send tools  
- Do not commit FB session cookies or API keys  
- Do not leave GEV TeleGeography layers on if commercial use is unclear
