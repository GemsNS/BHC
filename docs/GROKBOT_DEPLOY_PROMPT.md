# GrokBot prompt — deploy, rotate session secret, free setup, handback report

Copy everything below the line into GrokBot. Do **not** reseed. Staff accounts already exist.

---

## PROMPT (paste into GrokBot)

```
You are GrokBot operating on the BH Contracting (BHC) production host.

## Mission
1. Deploy current origin/main to production.
2. Rotate SESSION_SECRET only (invalidate all staff cookies). Do NOT reseed. Do NOT wipe CRM data. Do NOT reset staff PINs/passwords.
3. Configure every FREE account / webhook / env you can without charging the owner.
4. For anything that requires a paid account, paid phone number, paid AI key, or human login you cannot complete, write a handback report at:
   /opt/bhc/docs/GROKBOT_HANDBACK_REPORT.md
   (also copy a short summary to stdout at the end).

## Hard rules
- App dir: /opt/bhc
- Domain: https://bhcontracting.ca
- Systemd unit: bhc
- NEVER run: store reseed, store restore (unless deploy auto-rollback), seed wipe, drop database, rm data/store.json
- NEVER force-push git
- NEVER commit .env or secrets into git
- NEVER invent Stripe/Twilio/Anthropic keys — only write placeholders if missing, and list them in the handback report
- Prefer free tiers. If a service has no usable free path, stop and document it.
- After SESSION_SECRET rotation, staff keep existing passwords; they only need to log in again.

## Phase A — Deploy + rotate session (required)

Run on the host:

```bash
set -euo pipefail
cd /opt/bhc

# Snapshot .env before edits
cp -a .env ".env.bak.$(date -u +%Y%m%dT%H%M%SZ)"

# Rotate SESSION_SECRET (this invalidates every bhc_session cookie)
NEW_SESSION="$(openssl rand -hex 32)"
if grep -q '^SESSION_SECRET=' .env; then
  sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=${NEW_SESSION}/" .env
else
  printf '\nSESSION_SECRET=%s\n' "$NEW_SESSION" >> .env
fi

# Ensure AUTOMATION_SECRET exists (do not rotate if already set — cron/CI may depend on it)
if ! grep -q '^AUTOMATION_SECRET=.\+' .env; then
  printf 'AUTOMATION_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
fi

# Pull + install + deploy
git fetch origin
git checkout main
git pull origin main
npm ci
bash deploy/production/deploy.sh

# Health checks
curl -fsS http://127.0.0.1:3000/api/health | tee /tmp/bhc-health-local.json
curl -fsS https://bhcontracting.ca/api/health | tee /tmp/bhc-health-public.json || true

# Print env status (secrets redacted by the console if supported)
npm run console <<'EOF' || npm run bhc -- store health || true
env
EOF
```

If health fails, stop. Do not continue to Phase B. Capture deploy log from data/deploy/deploy.log (or data/backups path used by deploy.sh) into the handback report.

Confirm in the report:
- git SHA deployed
- SESSION_SECRET rotated: yes
- reseed run: NO
- /api/health status
- staff told: log in again with existing passwords

## Phase B — Free setups you MAY complete without owner payment

Only do these if you have credentials/access, or the step is fully free and scriptable.

### B1. Discord ops alerts (FREE)
If a Discord webhook URL is available in the environment, chat memory, or owner messages as DISCORD_WEBHOOK_URL:
```bash
cd /opt/bhc
npm run console <<EOF
hooks add ops-alerts-discord ${DISCORD_WEBHOOK_URL}
hooks test
EOF
```
If no URL is available, add to handback: owner must create a free Discord server → Channel → Integrations → Webhooks → copy URL.

### B2. Uptime monitor target (FREE — document only unless API token given)
Public health URL to monitor every 5 minutes:
  https://bhcontracting.ca/api/health
Expect HTTP 200. If UPTIMEROBOT_API_KEY is present, create a monitor; otherwise handback with exact click-path for UptimeRobot free tier.

### B3. Google review URL (FREE)
If REVIEW_URL / REVIEW_URL is already known, set it in .env and restart:
```bash
# only if owner provided the Google Business “Get more reviews” link
grep -q '^REVIEW_URL=' .env && sed -i "s|^REVIEW_URL=.*|REVIEW_URL=${REVIEW_URL}|" .env || echo "REVIEW_URL=${REVIEW_URL}" >> .env
sudo systemctl restart bhc
```
Otherwise handback: how to copy the link from Google Business Profile.

### B4. Gemini free-tier AI fallback (FREE quota — only if owner provides a Google AI Studio key)
Do NOT create a Google account for them.
If GEMINI_API_KEY is provided in chat/env:
```bash
# append/update GEMINI_API_KEY in /opt/bhc/.env
sudo systemctl restart bhc
```
Note in report: Gemini is fallback only; Anthropic is preferred for Mainframe drafts (paid usage).

### B5. Existing GoDaddy mailbox (FREE if already owned)
If SMTP_* and ADS_IMAP_* credentials already exist in .env, verify with console env / a safe test.
Do NOT invent mailbox passwords. If missing, handback with GoDaddy Workspace IMAP/SMTP settings:
- IMAP: imap.secureserver.net:993 SSL
- SMTP: smtpout.secureserver.net:465 SSL
- Needed: SMTP_HOST/USER/PASS, ADS_IMAP_HOST/USER/PASS, OUTREACH_REPLY_EMAIL, ETRANSFER_EMAIL

### B6. Kijiji saved-search alerts (FREE)
Cannot automate login to Kijiji for the owner unless credentials are explicitly provided.
Handback steps: create saved searches for HRM contractor-need keywords → email alerts to the CRM mailbox.

### B7. Do NOT enable autosend yet
Leave OUTREACH_AUTOSEND and DOCS_AUTOSEND unset/empty so nothing emails/SMS customers until providers are real.

### B8. Do NOT set BHC_STRICT_AUTH=1 yet
Leave legacy header fallback until the owner confirms all staff have re-logged in after the cookie rotation. Mention it as a follow-up in the report.

## Phase C — Paid / human-only (DO NOT buy — handback report)

For each item below, write status: NOT CONFIGURED + exact owner actions + estimated cost.

1. Anthropic API key (Claude) — console.anthropic.com — ~$15–40 CAD/mo with discovery; $5–10 without
   Env: ANTHROPIC_API_KEY
   Optional: ANTHROPIC_MODEL, ANTHROPIC_FAST_MODEL, DISCOVERY_*

2. Twilio + one Canadian 902 number — ~$5–15 CAD/mo
   Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, VOICE_FORWARD_TO
   Webhooks to set in Twilio console:
   - Messaging webhook POST https://bhcontracting.ca/api/sms/inbound
   - Voice webhook POST https://bhcontracting.ca/api/voice/inbound

3. Stripe account + webhook — no monthly fee; 2.9% + 30¢ per card payment
   Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
   Webhook: https://bhcontracting.ca/api/payments/webhook
   Events: checkout.session.completed, checkout.session.async_payment_succeeded

4. GoDaddy mailbox (if not already available) — ~$0–8/mo
   SMTP + IMAP for quotes/alerts/e-Transfer matching

5. Optional later autosend flags (after keys work):
   OUTREACH_AUTOSEND=email,sms
   DOCS_AUTOSEND=quote,receipt,job_report
   OUTREACH_AUTOSEND_TOUCHES=1

## Phase D — Write the handback report

Create /opt/bhc/docs/GROKBOT_HANDBACK_REPORT.md with this structure:

# GrokBot handback report — BHC production
- Date (UTC)
- Host
- Deployed git SHA
- Deploy health: local + public
- SESSION_SECRET rotated: yes/no
- AUTOMATION_SECRET present: yes/no
- Reseed run: NO (explicit)
- Staff action required: log in again with EXISTING passwords (cookies invalidated)

## Completed free setup
- bullet list of what you actually configured

## Blocked / needs owner (paid or human login)
| Item | Why blocked | Exact steps for owner | Est. cost | Env / webhook |
|------|-------------|-----------------------|-----------|---------------|

## Verify commands for owner
```bash
curl -fsS https://bhcontracting.ca/api/health
cd /opt/bhc && npm run console   # then: env
```

## Do not do yet
- reseed
- BHC_STRICT_AUTH=1 (until all staff re-login confirmed)
- OUTREACH_AUTOSEND / DOCS_AUTOSEND (until Twilio/SMTP/Stripe proven)

End by printing the report path and a 10-line summary.
```

---

## Owner one-liner after GrokBot finishes

1. Open `https://bhcontracting.ca/login` and sign in with your **existing** password.
2. Tell staff to do the same once.
3. Read `/opt/bhc/docs/GROKBOT_HANDBACK_REPORT.md` for anything still to buy.
4. Full catalog: `docs/SETUP_CHECKLIST.md`.
