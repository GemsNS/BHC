# Job-ad outreach — cold email / SMS replies to local ads

**Goal:** when someone in HRM posts "need siding / deck / windows / soffit — looking for quotes", BHC finds the ad, decides if it is real work, drafts a reply in your voice, sends it by email and/or text (after your approval, or automatically once you trust it), follows up once if they go quiet, and turns every reply into a lead → job in the CRM.

Everything ships **approval-first**: no message leaves the system until you click *Send* or set `OUTREACH_AUTOSEND`.

Surfaces: `/admin/ads` (web) · `npm run console` → `ads`, `ad`, `outreach` (terminal) · Mainframe AI tools `list_ads`, `outreach_status` · JARVIS "Job-ad outreach" card on the dashboard.

---

## 1. What to buy / set up (the shopping list)

| # | Service | What it does for you | Cost (approx., CAD) | Env vars |
|---|---------|----------------------|--------------------|----------|
| 1 | **Anthropic API key** — console.anthropic.com | Mainframe AI: triages every ad (real job vs. competitor ad), writes the reply in your voice, powers the chat/console. | Pay-as-you-go. Ad triage runs on **Claude Haiku 4.5** (~$0.002/ad); reply drafting on **Claude Opus 5** (~$0.03–0.05/reply). 200 ads + 60 replies a month ≈ **$3–5**. | `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL=claude-opus-5`, `ANTHROPIC_FAST_MODEL=claude-haiku-4-5` |
| 2 | **A mailbox for alerts + replies** — a new GoDaddy mailbox on your domain (e.g. `quotes@bhcontracting.ca`) | Receives Kijiji / Marketplace / Craigslist saved-search alert emails, *and* is the reply-to address on every outreach email so prospect replies land where the CRM can see them. | Included with GoDaddy Workspace / M365 ($8–12/mo if you need one more seat). | `ADS_IMAP_HOST`, `ADS_IMAP_USER`, `ADS_IMAP_PASS`, and the same mailbox in `SMTP_USER/SMTP_PASS`, `OUTREACH_REPLY_EMAIL` |
| 3 | **Kijiji alerts (free)** | On kijiji.ca, search *Services → Skilled Trades* / *Services Wanted* for "siding", "deck", "soffit", "windows", "contractor", "quote" in Halifax; click **Get alerts** on each search and send them to the mailbox above. Also Facebook Marketplace / groups via email notifications. | Free | — |
| 4 | **Twilio** — twilio.com | Sends the text replies and receives the answers/STOPs. Buy one **Canadian local number** (902). | Number ~$1.50/mo · ~$0.0100/segment outbound CA · inbound free-ish. 100 texts/mo ≈ **$3**. | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| 5 | *(optional)* **Zapier / Make / Cloudflare Email Worker** | Alternative to IMAP: forward alert emails or scrape a source and POST to `/api/ads/inbound`. Only needed if you cannot use a mailbox. | Zapier free tier covers ~100 tasks/mo | `ADS_INBOUND_SECRET` |
| 6 | *(optional)* **Slack or Discord** | A channel that gets a ping when an ad qualifies, a prospect replies, a proposal is signed, damage is reported. | Free | webhook URL → `npm run console` → `hooks add ops-alerts-slack <url>` |

Model choice: the CRM's default is **`claude-opus-5`** for anything customer-facing (drafts, chat) and **`claude-haiku-4-5`** for the high-volume yes/no triage. If you ever want to cut cost further, set `ANTHROPIC_MODEL=claude-sonnet-5` — drafts stay good, ~5× cheaper. Gemini/OpenAI keys still work as fallbacks (`GEMINI_API_KEY`, `OPENAI_API_KEY`), and with no key at all the pipeline runs on keyword rules and templates.

---

## 2. Ten-minute setup

1. **Paste keys** into `/opt/bhc/.env` (see `.env.example`, section *Job-ad outreach*), then `sudo systemctl restart bhc`.
2. **Check connections:** `npm run console` → `env`, or open `/admin/ads` → *Connections*. Send a test: `ads test-email you@…` / `ads test-sms +1902…`, or the buttons in the UI.
3. **Add sources:** in `/admin/ads` → *Add source*:
   - type **Alert mailbox (IMAP)**, name "Kijiji alerts" — uses the `ADS_IMAP_*` mailbox; optionally list keep/drop keywords.
   - type **RSS** for any site or RSS-bridge feed you have.
   - the **Inbound webhook** and **Manual paste** sources are created automatically the first time they are used.
4. **Create Kijiji alerts** (step 3 in the table) pointed at the mailbox. First alerts arrive within an hour.
5. **Point Twilio at the CRM:** Twilio Console → Phone Numbers → your number → Messaging → *A message comes in* → `https://bhcontracting.ca/api/sms/inbound` (HTTP POST). This is how replies and STOPs come back.
6. **Wait for the next tick** (every 15 min) or click *Check sources now*. Qualified ads show up with drafted replies under *Needs attention*.
7. **Approve or edit** each reply. *Send now* sends immediately; *Approve* sends on the next tick (respecting the daily cap and SMS quiet hours).
8. When you trust the drafts: `OUTREACH_AUTOSEND=email` (or `email,sms`) + `ADS_AUTOSEND_MIN_SCORE=75` → high-confidence replies go out on their own; lower scores still wait for you.

---

## 3. How it flows

```
Kijiji/Marketplace alert email ─┐
RSS feed ───────────────────────┤  ad_ingest (every 15 min)
Zapier/Cloudflare → /api/ads/inbound ─┤   ├─ parse → dedupe → AdListing(new)
Paste in UI / console ──────────┘   ├─ classify (Claude Haiku or rules) → score 0–100, category, jobType
                                    ├─ score ≥ ADS_MIN_SCORE → Lead (source "Ad · Kijiji") + workflows fire
                                    └─ draft reply (Claude Opus or template) → OutreachQueueItem
                                         email  (if ad has email)  ┐ pending_approval
                                         sms    (if ad has phone)  ┤ or approved when OUTREACH_AUTOSEND allows
                                         platform (neither)        ┘ → you paste it on Kijiji, click "I pasted it"

outreach_send (every 15 min): approved → SMTP/Resend or Twilio → status sent, lead → contacted, webhook outreach.sent
outreach_followup (daily 9am): sent + no reply after 3 days → ONE follow-up draft; no reply after 21 days → ad + lead auto-closed lost

Replies:
  SMS  → Twilio → /api/sms/inbound → STOP = opt-out (never contacted again) · anything else = ad "replied", lead "contacted",
         task "Reply to <name>", in-app alert, webhook outreach.replied
  Email → same mailbox (IMAP) → non-alert mail from a known prospect = reply · "no thanks / already found someone" = opt-out
```

Every step is idempotent: re-running never duplicates leads, drafts, or follow-ups. Ads are deduped by listing id / URL across alerts.

---

## 4. Compliance notes (Canada — CASL)

- You are **responding to a request for quotes** the person published, which CASL treats as an inquiry/implied consent. Templates still keep it clean: identify the business, give real contact info, one clear opt-out line, no discounts/pressure.
- **STOP / UNSUBSCRIBE / "no thanks"** are honoured automatically and stored in the do-not-contact list (`/admin/ads` and `npm run console` → `optouts`). Nothing in the queue can be sent to an opted-out address.
- SMS **quiet hours** default to 21:00–08:00 server time; daily cap 25 messages. Twilio also enforces carrier STOP handling on Canadian numbers.
- Keep `OUTREACH_MAX_FOLLOWUPS=1`. One polite nudge, then stop.

---

## 5. Knobs

| Env | Default | Meaning |
|-----|---------|---------|
| `ADS_MIN_SCORE` | 55 | Below this the ad is skipped (you can still *Draft reply anyway*) |
| `ADS_AUTOSEND_MIN_SCORE` | 75 | Auto-send only above this, and only for channels in `OUTREACH_AUTOSEND` |
| `ADS_CLASSIFY_BATCH` | 20 | Ads triaged per tick (AI cost guard) |
| `OUTREACH_AUTOSEND` | *(off)* | `email`, `sms`, or `email,sms` |
| `OUTREACH_DAILY_CAP` | 25 | Messages per day, all channels |
| `OUTREACH_QUIET_HOURS` | `21-8` | No SMS in this local window |
| `OUTREACH_FOLLOWUP_DAYS` / `OUTREACH_MAX_FOLLOWUPS` | 3 / 1 | Follow-up timing |
| `OUTREACH_EXPIRE_DAYS` | 21 | Auto-close unanswered ads |
| `OUTREACH_COMPANY_NAME`, `OUTREACH_SIGNER`, `OUTREACH_REPLY_PHONE`, `OUTREACH_REPLY_EMAIL`, `OUTREACH_WEBSITE`, `OUTREACH_SERVICE_AREA`, `OUTREACH_SERVICES` | BH defaults | Signature + one-line company description used in every draft |
| `DIGEST_EMAIL_TO` | *(off)* | Email the daily ops digest (incl. replies awaiting approval) to this address |

---

## 6. API

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/ads` | sources, listings (≤300), their outreach items, connection status, stats |
| POST | `/api/ads` | `add_source` · `update_source` · `remove_source` · `ingest` · `add_manual` · `requalify` · `redraft` · `skip` · `restore` · `mark_replied` · `set_status` · `update_outreach` · `approve` · `send` · `cancel` · `send_test` |
| PUT | `/api/ads` | `{ url }` → preview an RSS feed |
| POST | `/api/ads/inbound` | push an ad or a forwarded email; auth `x-bhc-inbound-secret` / `?secret=` |
| POST | `/api/sms/inbound` | Twilio webhook (signature-validated) |
| POST | `/api/outreach` | `{ action: "send", id }` now really sends when a provider is configured |

Console: `ads`, `ads ingest`, `ads add`, `ads sources`, `ads source add imap "Kijiji alerts"`, `ad <id>`, `ad approve <id> [email|sms]`, `ad send <id>`, `ad edit <draftId>`, `ad replied|won|lost|skip <id>`, `outreach`, `outreach approve all`, `outreach send`, `optouts`.

CLI: `npm run bhc -- ads status|ingest|add|list|send|test-email|test-sms`.

---

## 7. Files

`src/lib/ad-ingest.ts` (parsers, dedupe) · `ad-imap.ts` (mailbox) · `ad-classify.ts` (AI + rules, drafts) · `ad-pipeline.ts` (orchestration) · `outreach-send.ts` (send policy, follow-ups, opt-outs, inbound replies) · `sms.ts` (Twilio) · `mail.ts` → `sendEmail` · `src/app/api/ads/*`, `src/app/api/sms/inbound` · `src/app/admin/ads/page.tsx` · tests `tests/ad-outreach.test.ts`, `tests/outreach-inbound.test.ts`.
