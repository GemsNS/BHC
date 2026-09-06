# Cursor briefing — the automation build (September 2026)

Audience: Cursor (or any agent/engineer) picking up BHC after the Claude Code session that added the automation platform. Read this first; it is the map. Details live in the docs it links to. **Trust code over any older markdown** (some files still mention "Co.", store v8/v9, or PIN-only auth).

Repo `GemsNS/BHC` · production `https://bhcontracting.ca` (`/opt/bhc`, systemd `bhc`) · branch merged: `cursor/automation-supercharge-22fe` → `main` (4 commits: `20ad60f`, `bb8c9f8`, `89b9be1`, `25f4639`).

---

## 1. What changed, in one paragraph

BHC went from a CRM that waited for humans to one that runs itself. A server-side **automation engine** ticks every 15 minutes (reminders, invoice/job/inventory/tool/damage/fleet checks, backups, webhook retries). A **job-ad outreach pipeline** pulls "need a contractor" ads from Kijiji alert mail, RSS, webhooks, paste, and **Claude web search**, triages them, creates leads, drafts cold email/SMS replies, sends (approval-gated by default), follows up, and detects replies and STOPs. A **job hub** centralises each job: quote with **e-signature**, auto-created deposit invoice, **PDF contracts / invoices / receipts / job reports**, **Stripe** and e-Transfer payments, review and referral asks, a customer **portal**, and a two-way **inbox** (SMS, email, voicemail, missed-call text-back). Everything streams to a **live wire** on the dashboard. Underneath: signed cookie auth with lockout and an API gate, photos/PDFs on disk, optional SQLite, CI/CD with health-gated deploy and rollback, an interactive **console**, and a **setup checklist** of models/services/webhooks.

---

## 2. Architecture additions

```
                    ┌──────────── Node host (next start) ────────────┐
instrumentation.ts ─┤ startScheduler()  → runServerTick() every 15m  │
                    │ installEventFileSink() → data/events.jsonl      │
                    └────────────────────────────────────────────────┘
runServerTick → readStore → runAutomationTick(data, hooks) → writeStore
   hooks: backup, ads{pollImap}, senders{email,sms}, offloadMedia, discover, jobReports

runAutomationTick (src/lib/automation-engine.ts)
   for each enabled+due automation  → mainframe-automations.runAutomationDetailed | server hook
   → runScheduledWorkflows → deliverPendingWebhooks → AutomationTickRecord → live events

Store: readStore/writeStore (src/lib/store.ts) → store-backend.ts (json | sqlite)
       normalizeStore fills every new collection additively (old stores keep loading)
Media: data/media/* served by /api/media/[file] (cookie) — never base64 in the store any more
Auth:  /api/auth/login sets bhc_session (HMAC) → src/middleware.ts gates /api/* → api-auth.ts
Live:  src/lib/events.ts (ring) → /api/stream (SSE) → components/LiveWire.tsx
```

### New collections on `AppData` (`src/lib/types.ts`)

`automationRuns`, `adSources`, `adListings`, `optOuts`, `quotes`, `documents`, `payments`, `messages`. New optional fields on `Lead` (`referralCode`, `referredByCode`), `Job` (`number`, `portalToken`, `quoteId`, `completedAt`), `InvoiceDoc` (`number`, `token`, `dueAt`, `sentAt`, `paidAt`, `paidAmount`, `payUrl`, `remindersSent`), `OutreachQueueItem` (`kind`, `adId`, `jobId`, `invoiceId`, `provider*`, `followUpOf`, `repliedAt`), `WebhookEndpoint` (`format`, `preset`), `WebhookDelivery` (`nextRetryAt`, `completedAt`), `InAppNotification.dedupeKey`, `AssistantDailyAutomation.intervalMinutes`. Browser store key is **`bhc-crm-store-v10`**.

---

## 3. File map (new or heavily changed)

| Area | Files |
|------|-------|
| Engine | `src/lib/automation-engine.ts`, `automation-checks.ts` (idempotent ops checks), `automation-defaults.ts` (catalog + workflow templates), `mainframe-automations.ts`, `scheduler.ts`, `src/instrumentation.ts`, `src/lib/edge-stub.ts` |
| Workflows / webhooks | `src/lib/workflows.ts` (11 triggers, 13 actions), `webhooks.ts` (queue, backoff retry, formats json/slack/discord, presets, `describeWebhookEvent`) |
| Ads + outreach | `src/lib/ad-ingest.ts`, `ad-imap.ts`, `ad-classify.ts`, `ad-pipeline.ts`, `lead-discovery.ts`, `outreach-send.ts` (policy, follow-ups, opt-outs, inbound replies), `sms.ts` (Twilio), `mail.ts` (`sendEmail` + attachments) |
| Job hub | `src/lib/job-hub.ts`, `quotes.ts`, `documents.ts` (pdfkit), `deliver.ts`, `payments.ts` (Stripe + e-Transfer), `numbering.ts`, `customer-touches.ts` (review/referral/payment reminders), `job-reports.ts` |
| Inbox / voice | `src/lib/messaging.ts`, `twilio-verify.ts` |
| Platform | `src/lib/auth-session.ts`, `src/middleware.ts`, `store-backend.ts`, `store-backup.ts`, `store-health.ts`, `media-store.ts`, `events.ts`, `events-server.ts`, `reseed.ts` |
| API | `src/app/api/automation`, `health`, `stream`, `ads`, `ads/inbound`, `sms/inbound`, `voice/{inbound,status,voicemail}`, `messages`, `quotes`, `documents`, `payments`, `payments/webhook`, `jobs/[id]`, `media/[file]`, `public/{quote,pay,portal,referral}`, `auth/logout`, `seed` (keepStaff), `webhooks` (presets/test) |
| Admin pages | `/admin/automation`, `/admin/live`, `/admin/ads`, `/admin/inbox`, `/admin/jobs/[id]` (hub); nav in `src/lib/nav.ts` |
| Customer pages | `/q/[token]` (sign), `/pay/[token]`, `/portal/[token]`, `/r/[code]`; shared `src/app/q/[token]/quote.css` |
| UI | `src/components/LiveWire.tsx`, JARVIS additions in `src/lib/jarvis-briefing.ts` (automation, ads, inbox, receivables), `StatusBadge` tones, live-wire CSS in `globals.css` |
| Tooling | `scripts/bhc-console.ts` (`npm run console`), `scripts/bhc-cli.ts` (ads/webhooks/store/automations), `scripts/verify.sh`, `scripts/release.sh`, `deploy/production/{deploy.sh,bhc.service,bhc-automation.service,bhc-automation.timer}`, `.github/workflows/{ci,deploy-production,nightly,gh-pages}.yml`, `.github/dependabot.yml` |
| Tests | `tests/automation-engine`, `webhook-retry`, `workflow-triggers`, `store-backup`, `ad-outreach`, `outreach-inbound`, `platform`, `job-hub`, `reseed` (28 files / 146 tests total) |
| Docs | `docs/AUTOMATION.md`, `OUTREACH.md`, `SETUP_CHECKLIST.md`, `PRODUCTION.md` (reseed), `API.md`, `DEPLOYMENT.md`, `AGENT_MEMORY.md`, `CLAUDE.md`, this file |

---

## 4. The automations (all in `automation-defaults.ts`; toggle in `/admin/automation` or console `auto on|off`)

| Cadence | Automations |
|---------|-------------|
| every 15 min | ad_ingest · outreach_send (approved only) · task_reminders · webhook_retry |
| hourly | process_sequences |
| every 3 h | lead_discovery (Claude + web search; needs `ANTHROPIC_API_KEY`) |
| daily | pipeline_scan · invoice_followup · payment_reminders (7/14/30 d) · job_health · inventory_reorder · tool_overdue · damage_escalation · fleet_check · daily_digest (+ email via `DIGEST_EMAIL_TO`) · outreach_followup (+ auto-close after 21 d) · review_requests · referral_asks · media_offload · store_backup |
| weekly (Fri) | job_reports (customer PDF from the week's site updates) |
| off by default | prospect_hunt · outreach_digest |

Event workflows (templates ship **paused**): lead won → job; job completed → invoice draft; critical damage → alert + webhook; proposal signed → task.

Everything that **sends** is governed by: `OUTREACH_AUTOSEND` (ad replies), `OUTREACH_AUTOSEND_TOUCHES` (review/referral/reminders), `DOCS_AUTOSEND` (PDFs). With none set, the CRM drafts and a human clicks. Opt-outs are enforced before every send. SMS quiet hours and a daily cap apply.

---

## 5. Key flows

**Ad → job:** source → `ingestRawAds` (dedupe) → `qualifyListing` (Claude Haiku triage or rules; score ≥ `ADS_MIN_SCORE`) → lead + `onLeadCreated` workflows → `draftReply` (Claude Opus or template) → outreach items (email / sms / platform) → `processOutreachQueue` sends approved → reply via `/api/sms/inbound` or IMAP → `handleInboundReply` (STOP → opt-out; else lead contacted, task, alert) → ad won/lost.

**Quote → cash:** `createQuote` → `deliverDocument` (email PDF + SMS link `/q/<token>`) → customer `signQuote` → job (`JOB-YYYY-NNNN`, portal token) + deposit invoice (`INV-…`, pay token) + contract PDF; `applyPayment` (Stripe webhook / e-Transfer auto-match / manual) → invoice paid → job invoiced → receipt → review (7 d) → referral (14 d).

**Calls:** Twilio → `/api/voice/inbound` rings `VOICE_FORWARD_TO` → `/api/voice/status` on no-answer: missed-call SMS text-back, lead + task, voicemail prompt → `/api/voice/voicemail`: transcription, Claude one-line summary, inbox entry.

---

## 6. Build / runtime gotchas (read before touching)

- `src/middleware.ts` makes Next compile `instrumentation.ts` for **Edge** as well. Node-only modules (imapflow, mailparser, nodemailer, pdfkit, node:sqlite, fs) must not be statically reachable from it: `scheduler.ts` imports `ad-imap`, `lead-discovery`, `job-reports` **dynamically**, `next.config.ts` swaps `scheduler`/`events-server` for `src/lib/edge-stub.ts` on Edge and stubs core modules; those libs are in `serverExternalPackages`. `node:sqlite` is loaded with `process.getBuiltinModule` (bundlers ignore it).
- Claude 4.6+ models reject `temperature`; `ai-provider.ts` only sends it to Haiku 4.5/older. Defaults: `claude-opus-5` (main), `claude-haiku-4-5` (fast/triage).
- Tests need **Node 22** (vitest 4 uses `util.styleText`); CI uses Node 22. Local Node 21 fails.
- On Windows dev the `@rolldown/binding-win32-x64-msvc` optional dep may be missing after `npm ci` (npm bug) — `npm i --no-save @rolldown/binding-win32-x64-msvc@<rolldown version>`.
- After the first deploy with cookies, everyone must **log in again** (images/PDFs are cookie-authenticated). Set `SESSION_SECRET`. Later set `BHC_STRICT_AUTH=1` to retire the `x-bhc-user-id` header.
- `createBackup` in sqlite mode serialises `readStore()` to JSON so backups always restore anywhere.
- All checks are idempotent by design (`dedupeKey` on notifications, "open task exists" lookups, `providerId` on payments, stable ids on ads/webhooks). Keep that property when adding automations.

---

## 7. Commands

```bash
npm run verify                      # lint + typecheck + test + build (= CI)
npm run console                     # interactive: status, env, leads, lead, jobs, job, quote, docs, pay,
                                    #   inbox, ads, ad, outreach, optouts, auto, hooks, backup(s), restore, reseed, ai
npm run bhc -- automations tick --force | status
npm run bhc -- ads status | ingest | add "<title>" | list | send | test-email <to> | test-sms <to>
npm run bhc -- store health | backup | backups | restore <file> | reseed --yes [--fresh-staff] [--drop-optouts]
npm run bhc -- webhooks backlog | retry
npm run release [-- --ssh]          # verify → push main → CI → deploy (needs GitHub secrets)
bash deploy/production/deploy.sh    # on the host: snapshot → pull → npm ci if lockfile changed → side build → restart → health gate → auto-rollback
```

---

## 8. Configuration (what turns each piece on)

See `docs/SETUP_CHECKLIST.md` for the table with costs. Env groups in `.env.example`: platform (`SESSION_SECRET`, `AUTOMATION_SECRET`, `BHC_STORE`, `MEDIA_DIR`, `BHC_STRICT_AUTH`), AI (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_FAST_MODEL`, `DISCOVERY_*`), mailbox (`SMTP_*`, `ADS_IMAP_*`), ads/outreach (`ADS_*`, `OUTREACH_*`), Twilio (`TWILIO_*`, `VOICE_*`, `MISSED_CALL_*`), documents/payments (`DOCS_AUTOSEND`, `STRIPE_*`, `ETRANSFER_EMAIL`, `REVIEW_URL`, `COMPANY_*`), automation thresholds (`AUTOMATION_*`).

Inbound webhooks to configure at providers: Twilio SMS → `/api/sms/inbound`; Twilio Voice → `/api/voice/inbound`; Stripe → `/api/payments/webhook`; Zapier/Cloudflare → `/api/ads/inbound`; monitors → `/api/health`. Outbound presets: console `hooks add ops-alerts-slack|ops-alerts-discord|crm-sync|field-events|engine-health <url>`.

---

## 9. Verified vs. not yet exercised against real providers

Verified locally on a production build: cookie login + lockout, SSE stream, ad → lead → drafts, quote → sign → job + deposit invoice → e-Transfer record → contract/report PDFs, portal, pay page, signed Twilio SMS/voice webhooks, media auth, all admin pages, forced engine tick with zero errors, reseed keeping staff. 28 test files / 146 tests, typecheck and lint clean.

Not yet run against live services (no keys existed): Anthropic calls, IMAP against GoDaddy, Twilio sends, Stripe checkout/webhook, SMTP sends. Each has a "test" button/command and the same code path the smoke test used.

---

## 10. Suggested next steps (not done)

Cloud object storage adapter behind `media-store.ts`; QuickBooks two-way invoice/payment sync; auto-scheduler for crew days (weather + drive time); job costing report page; audit log of human edits; Sentry + uptime monitor; Capacitor wrap for background GPS; multi-tenant scoping. Retire the legacy header (`BHC_STRICT_AUTH=1`) once every device has re-logged in.

---

## 11. Conventions carried forward

Branches `cursor/<name>-22fe`, merge verified work into `main`; the owner runs the deploy. Additive migrations only (`normalizeStore`). Anything that creates business records or sends to customers ships paused/approval-gated. Emit `live.*` events from new features. Update `docs/AGENT_MEMORY.md` with dated entries when the owner states a preference.
