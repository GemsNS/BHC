# Lead intake — Kijiji / Craigslist / Facebook / discovery

## What’s broken right now (why alerts don’t become listings)

Production store shows the IMAP source error:

```text
Login is disabled
```

That means **Office 365 is rejecting basic IMAP username/password**. Kijiji alert emails can sit in the mailbox forever and the CRM will still show **0 listings**. Fixing search terms alone will not help until mailbox auth works (or you bypass IMAP with an inbound webhook).

## Better Kijiji saved searches (do this in the Kijiji UI)

Do **not** alert on bare keywords like `deck` or `windows` in Buy & Sell / Real Estate — that returns houses for sale that happen to have a deck.

Use **Services → Skilled Trades / Services Wanted** and demand language:

| Name | Query idea |
|------|------------|
| Siding wanted | `"looking for" OR "need a quote" siding OR "vinyl siding" OR soffit OR fascia` |
| Deck wanted | `("looking for" OR "need someone" OR "need a quote") (deck OR "deck repair" OR "new deck")` |
| Windows wanted | `("window replacement" OR "new windows") ("looking for" OR quote OR contractor)` |

Location: Halifax R.M. / Dartmouth / Bedford. Email every alert to the CRM mailbox.

Recipe source of truth in code: `src/lib/lead-search-recipes.ts` (`SAVED_SEARCH_RECIPES`).

## Other places to look

| Platform | How it enters BHC today |
|----------|-------------------------|
| Kijiji | Email alerts → IMAP (or forward → `/api/ads/inbound`) |
| Craigslist Halifax | Email alerts / RSS bridge → IMAP or inbound |
| Facebook Marketplace / groups | Email notifications are flaky; best path is Zapier/Make/Cloudflare Email Worker → inbound webhook |
| HomeStars | Pro request emails → same mailbox |
| Reddit r/halifax | Google Alerts or RSS → mailbox / inbound |
| Nextdoor | Email digests → mailbox (noisy; rely on classifier) |
| Claude web discovery | Scheduler job when `ANTHROPIC_API_KEY` + `DISCOVERY_ENABLED=1` |

There is **no** headless Kijiji/Facebook crawler in-repo (anti-bot / ToS). “Crawl the internet” here = **alerts + Claude web_search discovery + optional third-party scrapers you wire to the inbound API**.

## Tools you may need to add

1. **Working IMAP** (highest priority)
   - Microsoft 365: enable Authenticated SMTP + IMAP, create an **app password** (or Graph/OAuth — not implemented yet), put it in `ADS_IMAP_*` (do not reuse a blocked basic password).
   - Or move alerts to a **Gmail / Fastmail / Google Workspace** mailbox with IMAP app passwords (often simpler).
2. **Anthropic API key** — required for discovery + better triage (`DISCOVERY_ENABLED=1`).
3. **Inbound webhook bypass** (if IMAP stays broken): Zapier/Make/Cloudflare Email Routing Worker posts raw alert HTML to `POST /api/ads/inbound` with `ADS_INBOUND_SECRET`.
4. **Optional scrapers** (you operate, we ingest):
   - [rss-bridge](https://github.com/RSS-Bridge/rss-bridge) / [Changedetection.io](https://changedetection.io) watching Kijiji search URLs → webhook
   - Apify / Bright Data Kijiji actors → webhook
   - Manual paste in Admin → Ads when you see a post

## CRM-side filters (shipped in this change)

- IMAP keep keywords shifted to **demand phrases + specific trade terms** (not bare `deck`).
- Exclude list drops MLS / for-sale / realtor / bedroom / contractor-supply ads.
- Classifier heavily downscores real-estate noise.
- Empty Kijiji digests are **not** marked Seen (so a bad parse doesn’t burn the mail).
- Store health raises an **error** when IMAP lastError looks like login disabled.

## Ops after deploy

```bash
cd /opt/bhc && bash deploy/production/deploy.sh
# Fix IMAP auth OR wire inbound webhook (see Grokbot prompt)
npm run bhc -- ads status
npm run bhc -- ads ingest
# optional: force discovery once Anthropic is set
npm run bhc -- automations tick
```
