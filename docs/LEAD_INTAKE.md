# Lead intake — Kijiji / Craigslist / Facebook / discovery

> **Claude takeover brief:** see [`docs/CLAUDE_LEADS_HANDOFF.md`](./CLAUDE_LEADS_HANDOFF.md) — audit leads, ship realtime Kijiji + Facebook Marketplace ingest, fix outbound email.

## Why ads were zero

Production store showed the IMAP source error:

```text
Login is disabled
```

**Office 365 is rejecting basic IMAP username/password.** Kijiji alert emails can sit in the mailbox forever and the CRM still shows **0 listings**.

Additionally, until this change the CRM had **no default public scrape sources** — only IMAP — so a broken mailbox meant a dead pipeline.

## What works now (without IMAP)

On every `ads status` / `ads ingest` / scheduler tick the CRM auto-wires public sources (`ADS_PUBLIC_SOURCES=1`, default on):

| Source | Type | Notes |
|--------|------|--------|
| Reddit r/halifax demand search | RSS/Atom | Live from most hosts; best demand-side signal today |
| Reddit r/halifax trades search | RSS/Atom | Siding / deck / gutters / windows mentions |
| Kijiji HRM Services HTML searches | `html` | Parses `__NEXT_DATA__` `StandardListing` cards (trade terms) |
| **Kijiji HRM demand searches** | `html` | **New.** Intent-first searches (`looking for` / `need a quote`), newest first — see below |
| Craigslist Halifax RSS | RSS | Often **403** from cloud IPs; may work from production HRM egress |

Classifier + exclude lists still drop contractor-supply / real-estate noise after fetch.

## Realtime Kijiji demand (not contractor supply)

`src/lib/kijiji-realtime.ts` adds intent-first Kijiji Services searches (`adsrc-kijiji-demand-*`)
that are auto-wired by `ensurePublicAdSources` alongside the trade-term searches. The
difference is the source-level filter:

- **keep-list** = demand intent phrases (`looking for`, `need a quote`, `contractor wanted`, `anyone recommend`, …)
- **exclude-list** = supply + real-estate noise (`we install`, `free estimates`, `licensed and insured`, `for sale`, `open house`, …)

The shared detector `looksLikeDemand(text)` in `lead-search-recipes.ts` encodes the rule:
intent present **and** no supply pitch **and** not a for-sale/real-estate listing. It is the
same filter used by the Facebook path, so both intake routes agree on what "demand" means.

If Kijiji blocks the app server's datacenter IP (HTTP 403/429, soft-failed), run the
**operator sidecar** from HRM residential egress:

```bash
npx tsx scripts/fb-marketplace-scrape.ts --site kijiji --dry-run   # preview
npx tsx scripts/fb-marketplace-scrape.ts --site kijiji             # POST to /api/ads/inbound
```

## Facebook Marketplace sidecar (ops-owned session)

Facebook Marketplace needs a logged-in session and has no pollable public feed, so the app
server never scrapes it. Instead an **operator browser sidecar** runs on the host with an
**ops-owned** Facebook session and POSTs demand listings to the inbound API. No credential
automation, no login bypass, and the session file is stored **outside git**.

- Pure normalizer: `src/lib/facebook-marketplace.ts` (`normalizeFacebookListings`, `parseMarketplaceSearchJson`) — demand-only, deduped by `facebook:<itemId>`.
- Sidecar: `scripts/fb-marketplace-scrape.ts` — dynamically loads Playwright (host-only dep).
- Schedule: `deploy/production/bhc-fb-scrape.{service,timer}` (every 15 min).

One-time setup on the host:

```bash
cd /opt/bhc
npm i -D playwright && npx playwright install chromium
# Save an ops session (opens a browser; log in as the ops FB account):
sudo -u bhc FB_SESSION_STATE=/etc/bhc/fb-session/state.json \
  npx tsx scripts/fb-marketplace-scrape.ts --login
# Add to /opt/bhc/.env (never commit):
#   ADS_INBOUND_SECRET=...            (must match the server)
#   BHC_INBOUND_URL=http://127.0.0.1:3000/api/ads/inbound
#   FB_SESSION_STATE=/etc/bhc/fb-session/state.json
sudo cp deploy/production/bhc-fb-scrape.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now bhc-fb-scrape.timer
```

### Inbound payload contract (`POST /api/ads/inbound`)

The sidecar (or Zapier / Cloudflare Email Worker / any operator script) POSTs the **existing**
inbound shape — no new schema was invented:

```json
{ "title": "Looking for a deck builder", "body": "need a quote, Bedford",
  "url": "https://www.facebook.com/marketplace/item/42", "location": "Halifax",
  "externalId": "facebook:42", "contactEmail": "", "contactPhone": "" }
```

Auth: header `x-bhc-inbound-secret: $ADS_INBOUND_SECRET` (or `?secret=`). Each ad is deduped,
triaged, and — if it qualifies — turned into a lead + approval-first drafts.

## Better Kijiji saved searches (mailbox path)

Do **not** alert on bare keywords like `deck` or `windows` in Buy & Sell / Real Estate — that returns houses for sale that happen to have a deck.

Use **Services → Skilled Trades / Services Wanted** and demand language:

| Name | Query idea |
|------|------------|
| Siding wanted | `"looking for" OR "need a quote" siding OR "vinyl siding" OR soffit OR fascia` |
| Deck wanted | `("looking for" OR "need someone" OR "need a quote") (deck OR "deck repair" OR "new deck")` |
| Windows wanted | `("window replacement" OR "new windows") ("looking for" OR quote OR contractor)` |

Location: Halifax R.M. / Dartmouth / Bedford. Email every alert to the CRM mailbox.

Recipe source of truth in code: `src/lib/lead-search-recipes.ts` (`SAVED_SEARCH_RECIPES`, `DEFAULT_PUBLIC_AD_SOURCES`).

## Other places to look

| Platform | How it enters BHC today |
|----------|-------------------------|
| Kijiji | Public HTML search (auto) · Email alerts → IMAP · forward → `/api/ads/inbound` |
| Craigslist Halifax | RSS (auto, may be blocked) · Email alerts → IMAP |
| Reddit r/halifax | Atom search feeds (auto) |
| Facebook Marketplace / groups | Email notifications are flaky; Zapier/Make/Cloudflare → inbound webhook |
| HomeStars | Pro request emails → mailbox |
| Nextdoor | Email digests → mailbox (noisy; rely on classifier) |
| Claude web discovery | Scheduler job when `ANTHROPIC_API_KEY` + `DISCOVERY_ENABLED=1` |

There is **no** headless Kijiji/Facebook crawler beyond public search HTML / RSS (anti-bot / ToS). “Crawl the internet” here = **public feeds + alerts + Claude web_search + optional third-party scrapers wired to the inbound API**.

## Tools you may need to add

1. **Working IMAP** (still highest value for Kijiji alerts + prospect replies)
   - Microsoft 365: enable Authenticated SMTP + IMAP, create an **app password** (or Graph/OAuth — not implemented yet), put it in `ADS_IMAP_*`.
   - Or move alerts to a **Gmail / Fastmail / Google Workspace** mailbox with IMAP app passwords.
2. **Anthropic API key** — discovery + better triage (`DISCOVERY_ENABLED=1`).
3. **Inbound webhook bypass** (if IMAP stays broken): Zapier/Make/Cloudflare Email Routing Worker posts raw alert HTML to `POST /api/ads/inbound` with `ADS_INBOUND_SECRET`.
4. **Optional scrapers** (you operate, we ingest):
   - [rss-bridge](https://github.com/RSS-Bridge/rss-bridge) / [Changedetection.io](https://changedetection.io) watching Kijiji search URLs → webhook
   - Apify / Bright Data Kijiji actors → webhook
   - Manual paste in Admin → Ads when you see a post

## CRM-side filters

- IMAP keep keywords: **demand phrases + specific trade terms** (not bare `deck` alone as the only term).
- Public scrape sources use a lighter keep list / empty keep list for already-narrow Reddit searches.
- Exclude list drops MLS / for-sale / realtor / bedroom / contractor-supply ads.
- Classifier heavily downscores real-estate noise and supply ads.
- Empty Kijiji digests are **not** marked Seen (so a bad parse doesn’t burn the mail).
- Store health raises an **error** when IMAP lastError looks like login disabled.

## Ops after deploy

```bash
cd /opt/bhc && bash deploy/production/deploy.sh

# Wire sources + poll (works even when IMAP is broken)
npm run bhc -- ads ensure-sources
npm run bhc -- ads status
npm run bhc -- ads ingest
npm run bhc -- ads list --all

# optional: force discovery once Anthropic is set
npm run bhc -- automations tick

# still fix IMAP for alert emails + prospect replies (see GROKBOT_LEAD_INTAKE_PROMPT.md)
```

Expect: Reddit (and usually Kijiji HTML) show `fetched > 0` / new listings. Craigslist may log `HTTP 403` or `blocked` from some hosts — disable that source in Admin → Ads if noisy. IMAP stays red until mailbox auth is fixed.
