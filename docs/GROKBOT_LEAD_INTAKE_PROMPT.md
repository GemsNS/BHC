# Grokbot handback — fix lead intake (IMAP + Kijiji + discovery)

Paste everything below the line into Grokbot on the production host.

---

## PROMPT

```
You are Grokbot on the BH Contracting production host (/opt/bhc).

## Mission
Unblock CRM auto-lead intake so Kijiji / Craigslist / Facebook alert emails become real ad listings, and so Claude web discovery can find demand posts. Do not invent leads.

## Hard rules
- App dir: /opt/bhc · systemd unit: bhc · domain: production site already configured
- NEVER commit .env, NEVER reseed/wipe store, NEVER reset staff passwords
- Prefer free/cheap paths; hand browser control to the OWNER for CAPTCHA / 2FA / Kijiji login
- Write /opt/bhc/docs/GROKBOT_LEAD_INTAKE_REPORT.md when done

## Phase 0 — Deploy latest main
```bash
set -euo pipefail
cd /opt/bhc
cp -a .env ".env.bak.$(date -u +%Y%m%dT%H%M%SZ)"
git fetch origin
git checkout main
git pull origin main
npm ci
bash deploy/production/deploy.sh
curl -fsS http://127.0.0.1:3000/api/health
npm run bhc -- store health || true
npm run bhc -- ads status || true
```
Confirm store health no longer silently hides IMAP failure. Note `adsrc-imap` / mailbox source `lastError` (expect "Login is disabled" until Phase 1).

## Phase 1 — Fix mailbox IMAP (critical)
Root cause: Office 365 basic IMAP auth is disabled → CRM cannot read Kijiji alerts.

Try in order; stop when `ads ingest` returns messages without login error:

### 1A. App password on current Microsoft mailbox
1. Hand control to owner: Microsoft 365 admin / account security → enable IMAP + Authenticated SMTP for the CRM mailbox; create an app password if security defaults allow.
2. Put into /opt/bhc/.env (keep SMTP_* for outbound; set explicit IMAP):
```
ADS_IMAP_ENABLED=1
ADS_IMAP_HOST=outlook.office365.com
ADS_IMAP_PORT=993
ADS_IMAP_SECURE=true
ADS_IMAP_USER=<same mailbox>
ADS_IMAP_PASS=<app password>
ADS_IMAP_FOLDER=INBOX
ADS_IMAP_ALERT_SENDERS=kijiji.ca,craigslist.org,facebookmail.com,homestars.com,nextdoor.com
ADS_IMAP_MARK_SEEN=true
ADS_IMAP_MARK_EMPTY_ALERTS=false
```
3. `systemctl restart bhc`
4. Mark a few recent Kijiji alerts as Unread in the mailbox (CRM only polls unseen).
5. `npm run bhc -- ads ingest` and confirm listings > 0 OR a different error.

### 1B. If Microsoft still blocks basic auth — Gmail/Fastmail dedicated inbox (recommended)
1. Create free Fastmail / Google Workspace / Gmail inbox `alerts@…` (owner CAPTCHA).
2. Wire ADS_IMAP_* to that host/app password.
3. Forward or recreate Kijiji alerts to that address.
4. Keep SMTP_* on the company domain for outbound outreach if needed.

### 1C. Bypass IMAP entirely — Cloudflare Email Worker / Zapier → inbound API
1. Ensure `ADS_INBOUND_SECRET` exists in .env (generate if missing).
2. Create Cloudflare Email Routing (or Zapier Email Parser) that POSTs JSON to:
   `https://<prod-host>/api/ads/inbound`
   Header: `x-bhc-inbound-secret: <ADS_INBOUND_SECRET>`
   Body example: `{ "from":"alerts@kijiji.ca", "subject":"…", "html":"<raw html>", "text":"…" }`
3. Send a test alert and confirm Admin → Ads shows a listing with a real kijiji.ca URL.

## Phase 2 — Rebuild Kijiji saved searches (owner + you)
Delete broad alerts that are just `deck` / `windows` in Buy & Sell.

Create Services Wanted / Skilled Trades alerts (Halifax R.M.) emailing the working mailbox:

1) `"looking for" OR "need a quote" siding OR "vinyl siding" OR soffit OR fascia`
2) `("looking for" OR "need someone" OR "need a quote") (deck OR "deck repair" OR "new deck")`
3) `("window replacement" OR "new windows") ("looking for" OR quote OR contractor)`

Also set Craigslist halifax.craigslist.org skilled-trade / wanted email alerts if possible.

Facebook: Marketplace saved searches + HRM homeowner groups → email notifications to the same mailbox (or Zapier). Note: FB often does not email full listing URLs — inbound HTML must keep links.

## Phase 3 — Claude discovery
1. Confirm `ANTHROPIC_API_KEY` (or AgentRouter `ANTHROPIC_BASE_URL` + token) is set.
2. Set:
```
DISCOVERY_ENABLED=1
DISCOVERY_MAX_SEARCHES=8
DISCOVERY_REGION=Halifax Regional Municipality, Nova Scotia
```
3. Restart bhc; run an automation tick / discovery once; confirm no invented emails and URLs are live kijiji/craigslist/facebook links only.

## Phase 4 — Verify
```bash
npm run bhc -- store health
npm run bhc -- ads status
npm run bhc -- ads ingest
# Expect: imap lastError empty/null, adListings growing, health code imap_login_disabled gone
```
Screenshot or paste ads status JSON into the report.

## Phase 5 — Report
Write /opt/bhc/docs/GROKBOT_LEAD_INTAKE_REPORT.md with:
- IMAP path chosen (1A/1B/1C) and whether login works
- Kijiji searches created
- Discovery enabled Y/N
- Listing counts before/after
- Anything the owner still must click (Facebook group joins, paid scrapers, etc.)

## Optional paid scrapers (only if owner asks)
If alerts + discovery are still thin: recommend Changedetection.io or an Apify Kijiji actor posting to /api/ads/inbound. Do not buy without owner approval.
```
