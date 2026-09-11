# Claude handoff — Automated leads audit + realtime FB/Kijiji ingest + email outbound

**Repo:** `GemsNS/BHC` · **Production:** `/opt/bhc` · **Site:** `bhcontracting.ca` · **Service:** `bhc`  
**Main tip when this was written:** `804ec9c` (includes ads public sources #47 + doc-delete sync #48)  
**Owner ask:** Audit the automated leads system; build **realtime** ingest from **local Facebook Marketplace** and **Kijiji**; fix / take over **outbound email** so the CRM is actually autonomous.

---

## Mission (success criteria)

Claude owns this end-to-end until **all** of the following are true (or blockers are documented with exact next ops steps):

1. **Audit complete** — written report of what works, what is dead, and why realtime volume is low.
2. **Realtime Kijiji demand** — new *homeowner / “looking for quote”* listings in HRM appear in `/admin/ads` within ~15–30 minutes of posting (not just contractor “we install” supply ads).
3. **Realtime Facebook Marketplace (local HRM)** — same: demand-side listings enter the CRM pipeline without waiting on a broken IMAP mailbox.
4. **Outbound email works** — `npm run bhc -- ads test-email <addr>` succeeds from production; approved outreach drafts can send; config is documented in `/opt/bhc/.env` (never commit secrets).
5. **Autonomy** — scheduler / `automations tick` keeps ingesting + can send (or clearly queue for approval) without human babysitting IMAP.
6. **Tests + PR** — unit/fixture tests for new parsers; branch `cursor/<descriptive>-22fe`; draft PR to `main`; do **not** invent fake leads.

---

## Non-negotiables (safety / product)

- **Do not invent leads or contacts.** No synthetic names/emails/phones (see PR #35 / `outreach-guard`).
- **CASL:** outreach must read as a response to a *published* quote request; identify BH Contracting; include opt-out; honour STOP/UNSUBSCRIBE.
- **Approval-first** outbound unless `OUTREACH_AUTOSEND` is explicitly set by ops after email is proven.
- **Public / operator-owned data only.** Prefer:
  - public search HTML / RSS / Atom,
  - alert emails the business already receives,
  - operator-run scrapers that POST into `POST /api/ads/inbound` with `ADS_INBOUND_SECRET`.
- **Do not** build credential-stuffing, account-takeover, or login-bypass crawlers. If Facebook requires a logged-in session, use an **ops-owned** session cookie / browser profile on the production host (or a sidecar scraper) documented as a secret — never commit session cookies to git.
- Soft-fail HTTP **403/429** (already in `ad-pipeline.ts`); do not hammer blocked hosts.
- Branch naming: `cursor/<name>-22fe`. Prefer `ManagePullRequest` for PRs.

---

## Current architecture (read these first)

```
sources (IMAP | RSS | HTML | webhook | manual | [new scrapers])
  → ad-ingest (parse / dedupe)
  → ad-classify (Haiku or rules, score 0–100)
  → lead + outreach drafts
  → outreach-send (approval-first unless OUTREACH_AUTOSEND)
  → replies via IMAP or /api/sms/inbound
```

| Layer | Path |
|--------|------|
| Ingest / parsers / source wiring | `src/lib/ad-ingest.ts` |
| IMAP | `src/lib/ad-imap.ts` |
| Classify + draft copy | `src/lib/ad-classify.ts` |
| Poll / qualify / run | `src/lib/ad-pipeline.ts` |
| Default public sources + recipes | `src/lib/lead-search-recipes.ts` |
| Claude web discovery | `src/lib/lead-discovery.ts` |
| Outbound send | `src/lib/outreach-send.ts`, `src/lib/server-senders.ts`, `src/lib/mail.ts` |
| Scheduler (≈15 min) | `src/lib/scheduler.ts` → `automation-engine.ts` (`ad_ingest`, `outreach_send`, `outreach_followup`, `lead_discovery`) |
| Admin UI | `src/app/admin/ads/page.tsx` |
| Inbound API | `src/app/api/ads/inbound/route.ts` |
| CLI | `scripts/bhc-cli.ts` · `npm run bhc -- …` |
| Ops docs | `docs/LEAD_INTAKE.md`, `docs/OUTREACH.md`, `docs/GROKBOT_LEAD_INTAKE_PROMPT.md` |
| Env template | `.env.example` (Job-ad outreach + SMTP sections) |

**CLI you will use constantly:**

```bash
cd /opt/bhc   # or local checkout
npm run bhc -- ads status
npm run bhc -- ads ensure-sources
npm run bhc -- ads ingest
npm run bhc -- ads list --all
npm run bhc -- ads send
npm run bhc -- ads test-email you@example.com
npm run bhc -- store health
npm run bhc -- automations tick -- --force
```

**HTTP:**

| Method | Path | Auth |
|--------|------|------|
| `GET/POST` | `/api/ads` | staff session |
| `POST` | `/api/ads/inbound` | `x-bhc-inbound-secret` / `ADS_INBOUND_SECRET` |
| `POST` | `/api/outreach` | staff |
| `GET` | `/api/health` | public |

---

## What is broken / thin today (start your audit here)

### A. Realtime volume is low

| Source | Reality |
|--------|---------|
| **IMAP Kijiji/FB alerts** | **Dead.** M365 returns `Login is disabled` (basic IMAP blocked). Highest-value path for demand alerts + prospect replies. See `docs/GROKBOT_LEAD_INTAKE_PROMPT.md`. |
| **Reddit r/halifax RSS** | Best live *demand* signal today; can **429** from cloud IPs (soft-fail). |
| **Kijiji HTML** (`DEFAULT_PUBLIC_AD_SOURCES`) | Fetches Services search pages via `__NEXT_DATA__`, but they are mostly **contractor supply** (“we install / free estimates”). Classifier correctly skips many → **few real leads**. |
| **Craigslist RSS** | Often **HTTP 403** from cloud/GitHub IPs; may work from HRM egress. |
| **Facebook Marketplace** | **Not scraped.** Only: `facebookmail.com` alerts → IMAP, Zapier/forward → `/api/ads/inbound`, or Claude discovery `site:facebook.com/marketplace` when `DISCOVERY_ENABLED=1` + Anthropic. URL dedupe already understands `/marketplace/item/<id>`. |

PR **#47** fixed “zero ads” by auto-wiring public Reddit/Kijiji HTML. That restored *volume* of listings, not *quality demand*. Owner still needs **realtime homeowner posts**.

### B. Email outbound “not configured”

Treat production `/opt/bhc/.env` as source of truth (never commit). Verify and fix:

| Group | Vars |
|-------|------|
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| Or Resend | `RESEND_API_KEY` |
| Outreach identity | `OUTREACH_COMPANY_NAME`, `OUTREACH_SIGNER`, `OUTREACH_REPLY_EMAIL`, `OUTREACH_REPLY_PHONE`, `OUTREACH_WEBSITE`, … |
| Autosend (leave off until SMTP proven) | `OUTREACH_AUTOSEND`, `OUTREACH_DAILY_CAP`, `OUTREACH_QUIET_HOURS` |
| AI triage | `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`, models |
| Discovery | `DISCOVERY_ENABLED`, `DISCOVERY_*` |
| IMAP (inbound alerts) | `ADS_IMAP_*` or SMTP fallback |

**Acceptance for email:**

```bash
sudo -u bhc bash -lc 'cd /opt/bhc && npm run bhc -- ads test-email <owner-email>'
# Then approve one real draft in /admin/ads and:
sudo -u bhc bash -lc 'cd /opt/bhc && npm run bhc -- ads send'
```

Document exact working provider (GoDaddy SMTP vs Resend vs M365 SMTP) in this file’s “Ops notes” section at the bottom when done.

---

## Phase 0 — Audit (do this first, write findings into the PR)

Run on production (or a copy of prod store):

```bash
cd /opt/bhc
sudo -u bhc bash -lc 'cd /opt/bhc && npm run bhc -- ads status'
sudo -u bhc bash -lc 'cd /opt/bhc && npm run bhc -- ads ingest'
sudo -u bhc bash -lc 'cd /opt/bhc && npm run bhc -- ads list --all' | head -80
sudo -u bhc bash -lc 'cd /opt/bhc && npm run bhc -- store health'
# Check SMTP without printing secrets:
sudo -u bhc bash -lc 'cd /opt/bhc && node -e "const e=process.env; console.log({SMTP_HOST:e.SMTP_HOST,SMTP_USER:e.SMTP_USER,SMTP_FROM:e.SMTP_FROM,hasPass:!!e.SMTP_PASS,RESEND:!!e.RESEND_API_KEY,IMAP_HOST:e.ADS_IMAP_HOST||e.SMTP_HOST,IMAP_USER:e.ADS_IMAP_USER||e.SMTP_USER,hasImapPass:!!(e.ADS_IMAP_PASS||e.SMTP_PASS),ADS_IMAP_ENABLED:e.ADS_IMAP_ENABLED,ANTHROPIC:!!(e.ANTHROPIC_API_KEY||e.ANTHROPIC_AUTH_TOKEN),DISCOVERY:e.DISCOVERY_ENABLED})"'
```

Deliverable: short audit section covering source-by-source lastError, last 24h ad counts, supply vs demand ratio, SMTP send test result.

---

## Phase 1 — Realtime Kijiji demand scraper

### Goal
Ingest **new** HRM Kijiji listings that are *demand* (homeowner seeking a contractor), not contractor ads.

### Preferred approaches (pick strongest that survives anti-bot)

1. **Fix IMAP + Kijiji Services Wanted email alerts** (still the cleanest long-term). Use app password / alternate mailbox / Graph if needed (`docs/GROKBOT_LEAD_INTAKE_PROMPT.md`).
2. **Expand `html` sources** in `lead-search-recipes.ts` / `DEFAULT_PUBLIC_AD_SOURCES` to **Services Wanted / “looking for”** search URLs sorted `dateDesc`, not only Services “siding/deck/windows” supply searches.
3. **Dedicated Kijiji poller** in `ad-ingest.ts` / new module:
   - Reuse `parseKijijiSearchHtml` / `__NEXT_DATA__` `StandardListing`.
   - Poll every scheduler tick; dedupe via existing `kijiji:<id>` keys.
   - Tighten demand classifier: keep “looking for / need a quote / anyone recommend”; exclude “we install / free estimates / licensed and insured / call us today”.
4. If Kijiji blocks datacenter IPs: run a **small sidecar** on the HRM VPS (Playwright/curl with residential-like headers) that POSTs raw listings to `/api/ads/inbound`.

### Must ship
- Fixture tests with real captured HTML (redact PII) proving non-zero demand parses.
- CLI still works: `ads ensure-sources` + `ads ingest`.
- Admin shows source health (`lastError`, last polled).

---

## Phase 2 — Realtime Facebook Marketplace (local)

### Goal
HRM Marketplace posts for siding / decks / windows / exterior work enter `adListings` quickly.

### Reality check
FB Marketplace is aggressively anti-bot and usually needs a logged-in session. The CRM **already** understands Marketplace item URLs (`facebook:<itemId>` in `ad-ingest.ts`) but has **no crawler**.

### Acceptable implementations (in order of preference)

1. **Operator browser sidecar** (recommended): Playwright on `/opt/bhc` or a sibling service, using an ops Facebook account session stored outside git (`/etc/bhc/fb-session/` or env). Scrape *search results for Halifax Marketplace* only; emit JSON to `POST /api/ads/inbound`.
2. **Email path restored:** Marketplace notification mail → working IMAP → existing alert parser (extend if FB HTML differs).
3. **Third-party / Zapier** → inbound webhook (document the Zap).
4. **Do not** rely only on Claude `lead-discovery` web search — too slow and sparse for “realtime.”

### Must ship
- New source type or webhook contract documented in `docs/LEAD_INTAKE.md`.
- Deduping Marketplace item IDs.
- Rate limits + soft-fail; never store FB passwords in the repo.
- Clear systemd unit or script: e.g. `bhc-fb-scrape.timer` every 10–15 minutes.

---

## Phase 3 — Email outbound takeover

1. Read `src/lib/mail.ts`, `server-senders.ts`, `outreach-send.ts`.
2. On production, make SMTP **or** Resend work; prefer whatever GoDaddy/M365 already allows for `quotes@` / `ads@`.
3. Prove with `ads test-email`.
4. Send one **approved** outreach to a safe internal address.
5. Leave `OUTREACH_AUTOSEND` off until owner confirms; document how to enable (`email` or `email,sms`).
6. If IMAP stays dead, still ensure **outbound** works independently; route inbound replies via forward-to-webhook until IMAP is fixed.

---

## Phase 4 — Autonomy glue

- Confirm `bhc` service + scheduler OR `bhc-automation.timer` runs `ad_ingest` on a 10–15 min cadence.
- `automations tick` must not hard-fail the whole tick on soft 403/429 when other sources succeed (already partially fixed in #47 follow-up).
- Optional: enable `DISCOVERY_ENABLED=1` only after Anthropic key is present — backup, not primary realtime path.
- Update `docs/LEAD_INTAKE.md` + `docs/OUTREACH.md` with the new scrape paths.

---

## Suggested implementation sketch

```text
src/lib/kijiji-realtime.ts      # demand search URLs + parse + normalize → RawAd[]
src/lib/facebook-marketplace.ts # session scrape OR inbound normalizer
scripts/fb-marketplace-scrape.ts # sidecar CLI posting to /api/ads/inbound
deploy/production/bhc-fb-scrape.service + .timer
tests/kijiji-realtime.test.ts
tests/facebook-marketplace.test.ts
docs/LEAD_INTAKE.md             # update “What works now”
```

Wire new sources through `ensurePublicAdSources` / `ads ensure-sources` so every tick refreshes them.

Inbound payload shape should match what `/api/ads/inbound` already accepts (read that route before inventing a new schema).

---

## Test plan

```bash
# Unit / fixtures
npx vitest run tests/public-ad-sources.test.ts tests/ad-outreach.test.ts tests/kijiji-realtime.test.ts tests/facebook-marketplace.test.ts
npx tsc --noEmit

# Local / prod smoke
npm run bhc -- ads ensure-sources
npm run bhc -- ads ingest
npm run bhc -- ads list --all
npm run bhc -- ads test-email <safe-inbox>
npm run bhc -- automations tick -- --force
curl -sS http://127.0.0.1:3000/api/health
```

Prove with evidence: count of ads created in last hour, sample demand titles, screenshot of `/admin/ads`, SMTP test log (no secrets).

---

## Deploy (after merge)

```bash
cd /opt/bhc && bash deploy/production/deploy.sh
sudo -u bhc bash -lc 'cd /opt/bhc && npm run bhc -- ads ensure-sources && npm run bhc -- ads ingest && npm run bhc -- ads status'
# If sidecar added:
# sudo systemctl enable --now bhc-fb-scrape.timer
curl -sS http://127.0.0.1:3000/api/health
```

---

## Related PRs / history

| PR | Note |
|----|------|
| #47 | Public Reddit/Kijiji HTML sources; fixed zero-ads when IMAP dead |
| #40 | Tighten Kijiji intake + surface IMAP auth failure |
| #35 | Stop inventing fake leads |
| #48 | Unrelated (doc delete / portal) |

---

## Ops notes (Claude: fill in when finished)

- SMTP provider working: _TBD_
- IMAP status: _TBD_
- Kijiji realtime method: _TBD_
- FB Marketplace method: _TBD_
- Autosend enabled?: _no / email / …_
- Follow-ups for humans: _TBD_

---

## Paste-ready prompt for Claude

> You are taking over BH Contracting (`GemsNS/BHC`) automated leads. Read `docs/CLAUDE_LEADS_HANDOFF.md` fully, then `docs/LEAD_INTAKE.md`, `docs/OUTREACH.md`, and `docs/GROKBOT_LEAD_INTAKE_PROMPT.md`.  
> 1) Audit ads/IMAP/SMTP on production (`/opt/bhc`) and report.  
> 2) Ship realtime **Kijiji demand** ingest (not contractor supply).  
> 3) Ship realtime **Facebook Marketplace HRM** ingest via ops-owned session sidecar or restored mail/webhook — no fake leads, no auth bypass.  
> 4) Fix outbound email until `ads test-email` works; leave autosend off until confirmed.  
> 5) Branch `cursor/leads-realtime-fb-kijiji-22fe`, tests, PR to main, deploy notes.  
> Go as far as the environment allows; document blockers with exact env/ops steps.
