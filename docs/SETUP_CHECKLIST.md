# Setup checklist — models, services, keys, and webhooks

Everything the BHC CRM can do on its own, and exactly what to buy or configure to switch each piece on. Nothing here changes behaviour until its key is set, so you can go down the list at your own pace. Check progress any time with `npm run console` → `env`, or `/admin/automation`.

---

## 1. AI models (Anthropic — one account, one key)

| Where it runs | Model | Env | What it does | Cost guide (CAD) |
|---------------|-------|-----|--------------|------------------|
| Mainframe chat, console, reply drafting, quote/inbox drafting | **Claude Opus 5** | `ANTHROPIC_MODEL=claude-opus-5` (default) | Customer-facing writing, tool-using assistant, voicemail summaries | ≈ $0.03–0.06 per drafted message |
| Ad triage (yes/no + score on every ad) | **Claude Haiku 4.5** | `ANTHROPIC_FAST_MODEL=claude-haiku-4-5` (default) | 200+ ads/month cheaply | ≈ $0.002 per ad |
| Internet lead discovery (web search) | **Claude Opus 5 + web search tool** | `DISCOVERY_MODEL` (default = main), `DISCOVERY_MAX_SEARCHES=8` | Every 3 h searches for “looking for a contractor” posts in HRM | ≈ $0.10–0.25 per run → $25–60/mo at 8 runs/day; lower `DISCOVERY_MAX_SEARCHES` or interval to trim |
| Cost-saver option | Claude Sonnet 5 | `ANTHROPIC_MODEL=claude-sonnet-5` | Same jobs, ~5× cheaper drafts, slightly less polish | ≈ $0.01 per draft |
| Fallbacks (optional) | Gemini / OpenAI | `GEMINI_API_KEY`, `OPENAI_API_KEY` | Used only if no Anthropic key | — |

**Buy:** one Anthropic API key at console.anthropic.com → API Keys. Put it in `/opt/bhc/.env` as `ANTHROPIC_API_KEY`. Set a monthly spend limit in the console ($50 is plenty to start). With no key at all, everything still runs on rules and templates.

Expected total AI spend at BHC's volume: **$15–40 / month** with discovery on, **$5–10** without.

---

## 2. Services to sign up for

| # | Service | Why | Cost | Keys |
|---|---------|-----|------|------|
| 1 | **Anthropic** (above) | brains | usage | `ANTHROPIC_API_KEY` |
| 2 | **GoDaddy mailbox** `quotes@bhcontracting.ca` (or reuse an existing one) | receives Kijiji/Marketplace alerts, prospect replies, e-Transfer notices; sends every email the CRM writes | included / ~$8 mo | `SMTP_HOST/SMTP_USER/SMTP_PASS`, `ADS_IMAP_HOST/USER/PASS`, `OUTREACH_REPLY_EMAIL`, `ETRANSFER_EMAIL` |
| 3 | **Kijiji saved-search alerts** → that mailbox | free ad intake | free | — |
| 4 | **Twilio** + one 902 number | SMS out/in, voice forwarding, voicemail transcription, missed-call text-back | number $1.50 mo + ~$0.01/SMS + ~$0.02/min voice → **$5–15 mo** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `VOICE_FORWARD_TO` |
| 5 | **Stripe** | card / Apple Pay / Google Pay on invoices, deposit on quote signing | 2.9% + 30¢ per card payment, no monthly | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| 6 | **Google Business Profile** review link | review requests after every paid job | free | `REVIEW_URL` |
| 7 | *(optional)* Slack or Discord | live alerts channel | free | webhook URL → `hooks add ops-alerts-slack <url>` |
| 8 | *(optional)* Zapier / Make | push ads or mirror CRM events to sheets, QuickBooks, etc. | free tier | `ADS_INBOUND_SECRET`, `crm-sync` webhook preset |
| 9 | *(optional)* Better Stack / UptimeRobot | ping `/api/health` every 5 min | free tier | none |

---

## 3. Webhooks you configure at the provider (inbound to BHC)

| Provider setting | URL | Purpose |
|------------------|-----|---------|
| Twilio → Phone number → **Messaging** → *A message comes in* (POST) | `https://bhcontracting.ca/api/sms/inbound` | text replies, STOP opt-outs, new inbound leads |
| Twilio → Phone number → **Voice** → *A call comes in* (POST) | `https://bhcontracting.ca/api/voice/inbound` | rings your cell, voicemail + transcription, missed-call text-back |
| Stripe → Developers → **Webhooks** → Add endpoint (events `checkout.session.completed`, `checkout.session.async_payment_succeeded`) | `https://bhcontracting.ca/api/payments/webhook` | marks invoices paid, sends receipts, triggers review timer |
| Zapier / Make / Cloudflare Email Worker (optional) | `https://bhcontracting.ca/api/ads/inbound` + header `x-bhc-inbound-secret` | push ads / forwarded alert emails |
| GitHub → repo **Secrets** | `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY`, `AUTOMATION_SECRET` | push-to-deploy + nightly tick |
| Uptime monitor | `https://bhcontracting.ca/api/health` | 200 = healthy |

## 4. Webhooks BHC sends (outbound — you paste a URL)

Create in `npm run console` → `hooks add <preset> <url>` or `POST /api/webhooks {preset,url}`:

| Preset | Send to | You get |
|--------|---------|---------|
| `ops-alerts-slack` / `ops-alerts-discord` | Slack Incoming Webhook / Discord channel webhook | human-readable pings: ad qualified, reply received, quote signed, payment received, damage, engine errors |
| `crm-sync` | Zapier / Make / n8n catch hook | signed JSON for every lead/job/invoice/quote/outreach event → sheets, QuickBooks, Google Contacts |
| `field-events` | anything | door-knocking activity |
| `engine-health` | Healthchecks.io / Better Stack | one ping per engine tick |

Every outbound webhook carries `X-BHC-Signature` (HMAC-SHA256), retries with backoff, and can be tested with `hooks test <id>`.

---

## 5. Turn-on order (recommended)

1. `SESSION_SECRET` (any long random string) → restart → everyone logs in once more. Then `BHC_STRICT_AUTH=1`.
2. `ANTHROPIC_API_KEY` → drafts get good.
3. Mailbox (`SMTP_*` + `ADS_IMAP_*`) → outreach email, alert intake, reply detection, e-Transfer matching.
4. Kijiji alerts → ads start flowing (check `/admin/ads`).
5. Twilio → texts, calls, missed-call text-back. Point both webhooks at the URLs above.
6. Stripe → pay links on every invoice; deposit collected at signing.
7. `REVIEW_URL` → reviews and referrals run themselves.
8. Decide what auto-sends: `OUTREACH_AUTOSEND=email,sms`, `DOCS_AUTOSEND=quote,receipt,job_report`, `OUTREACH_AUTOSEND_TOUCHES=1`. Until then the CRM drafts and you click.
9. `BHC_STORE=sqlite` once the host runs Node ≥ 22.13 (`node -v`); backups stay JSON.
10. Slack/Discord webhook so the live wire also reaches your phone.

---

## 6. What runs by itself once keys are in

| Every 15 min | Every 3 h | Daily | Weekly | On events |
|--------------|-----------|-------|--------|-----------|
| poll ad sources, triage, draft replies · send approved outreach · reminders · webhook retries | internet lead discovery | pipeline scan · invoice follow-up + payment reminders (7/14/30 d) · job health · inventory · tools · damage · fleet · digest (+ email) · outreach follow-ups & auto-close · review requests · referral asks · photo housekeeping · backup | customer job reports (Fri) | quote signed → job + deposit invoice + contract + PDFs · payment → receipt · missed call → text-back + lead · inbound text/email → thread + task · STOP → opt-out |

Watch it live: `/admin/live` (or the strip on the dashboard).
