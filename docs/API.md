# API reference

Base URL: same origin as the app (`http://localhost:3000` in dev). JSON unless noted.

Static GitHub Pages has **no API routes**. Use client/localStorage fallbacks.

Auth is currently client-side (PIN login). Treat APIs as **trusted-LAN / demo** until cookie auth is added.

## Store

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/store` | Full `AppData` |
| PUT | `/api/store` | Replace store |
| POST | `/api/seed` | Reset to seed |

## Auth

| Method | Path | Body |
|--------|------|------|
| POST | `/api/auth/login` | `{ login, pin }` → employee |

## AI

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/ai/status` | `{ provider, configured, model, gemini, openai }` |
| POST | `/api/ai/chat` | `{ messages, authorId? }` → Mainframe turn |
| POST | `/api/ai/summarize` | `{ jobId? notes? imageCount? jobTitle? customerName? }` |
| GET/POST | `/api/assistant` | Automations + audit; POST `{ action: "run_daily" \| "run_automation", force?, automationId? }` |

## Active Knocker — `GET /api/knocker`

Returns zones, knocks, territories, tags, products, services, todos, proposals, chat, repLocations, colorCodes, employees, calendarEvents, notifications, gpsConfig, webhookEndpoints (secret truncated), webhookDeliveries.

## Active Knocker — `POST /api/knocker`

JSON `{ action, ...fields }`.

| action | Fields | Result |
|--------|--------|--------|
| `create_pin` | zoneId, knockerId, address, outcome, notes?, contact fields, tagIds, lat/lng, createLead, allowDuplicate | 201 knock+lead or **409** double-knock |
| `create_territory` | name, zoneId?, points[{lat,lng}], colorHex?, assignedRepIds | turf + pinsBound |
| `assign_territory` | territoryId, repIds | ok |
| `ping_location` | employeeId, lat, lng, accuracy? | ok |
| `create_todo` | title, pinId?, dueAt?, priority?, assignedToId? | todo + notification |
| `complete_todo` | id | ok |
| `post_chat` | authorId, body, sharedPinId? | message |
| `create_proposal` | pinId, createdById, productIds?, serviceIds?, extras?, taxRate?, notes?, appointmentAt? | proposal |
| `sign_proposal` | proposalId, signerName, signatureDataUrl, signerEmail? | signed proposal |
| `create_calendar` | title, startAt, employeeId, endAt?, location?, description?, pinId?, todoId? | calendar event |
| `save_gps` | distanceFilterMeters, desiredAccuracy, enabled, wakeLock | gpsConfig |
| `create_webhook` | name, url, events? | endpoint **with secret** |

Outcomes: `not_home` `interested` `pitched` `appointment` `sold` `callback` `not_interested` `do_not_knock`.

## Calendar

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/calendar` | ICS of all knocker events |
| GET | `/api/calendar?id=<eventId>` | Single event ICS |

Client also builds Google template URLs via `googleCalendarUrl()` (no API).

## Webhooks

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/webhooks` | endpoints, deliveries, event names |
| POST | `/api/webhooks` | `{ name, url, events? }` → endpoint + **secret once** |
| PATCH | `/api/webhooks` | `{ id, enabled?, url? }` |
| DELETE | `/api/webhooks?id=` | remove endpoint |

### Outbound payload

```http
POST <your-url>
Content-Type: application/json
X-BHC-Event: pin.created
X-BHC-Signature: sha256=<hex hmac sha256 of raw body>
```

```json
{
  "event": "pin.created",
  "occurredAt": "2026-08-24T12:00:00.000Z",
  "data": { "knockId": "…" }
}
```

Verify: HMAC-SHA256 of the **raw JSON body** with endpoint `secret`. Extra headers: `X-BHC-Delivery` (id, stable across retries) and `X-BHC-Attempt` (1–5).

Events: `pin.created`, `pin.updated`, `proposal.created`, `proposal.signed`, `todo.created`, `todo.completed`, `territory.created`, `automation.ran`, `lead.created`, `lead.status_changed`, `job.created`, `job.status_changed`, `invoice.status_changed`, `damage.reported`, `ticket.created`, `workflow.ran`, `automation.tick`.

Deliveries are stored in `webhookDeliveries` (last 200) with `status`, `attempts`, `nextRetryAt`, `completedAt`. Failures retry with exponential backoff (5/10/20/40 min, max 5 attempts) on each automation tick. Force a retry: `POST /api/automation {"action":"retry_webhooks"}` or `npm run bhc -- webhooks retry`.

## Automation engine

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/automation` | scheduler info, automation status (due/last run), store health, backups, recent ticks, alerts, webhook backlog |
| POST | `/api/automation` | `{ action: "tick", force? }` · `{ action: "run", ids }` · `{ action: "toggle", id, enabled? }` · `{ action: "backup", name? }` · `{ action: "restore", name }` · `{ action: "retry_webhooks" }` · `{ action: "mark_read", ids? }` · `{ action: "clear_notifications" }` |
| GET | `/api/health` | public liveness — `{ ok, store, scheduler, ai, mail, uptimeSec, commit }`; 200 or 503 |

Auth for `/api/automation`: admin/manager session header, or `x-bhc-automation-secret: $AUTOMATION_SECRET` for cron/CI. Full guide: `docs/AUTOMATION.md`.

## Job ads & outreach

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/ads` | sources, listings, outreach drafts, connection status (AI/email/SMS/IMAP), stats |
| POST | `/api/ads` | `{ action }` ∈ add_source · update_source · remove_source · ingest · add_manual · requalify · redraft · skip · restore · mark_replied · set_status · update_outreach · approve · send · cancel · send_test |
| PUT | `/api/ads` | `{ url }` → preview an RSS/Atom feed |
| POST | `/api/ads/inbound` | push `{title, body, url, contactEmail, contactPhone}` or a forwarded email `{subject, text|html, from}`; auth `x-bhc-inbound-secret` or `?secret=` |
| POST | `/api/sms/inbound` | Twilio inbound SMS webhook (X-Twilio-Signature validated); STOP → opt-out, else reply → lead/ad updated |
| POST | `/api/outreach` | `{ action: "send", id }` performs a real send when SMTP/Resend or Twilio is configured (falls back to mark-sent) |
| POST | `/api/webhooks` | `{ preset, url }` creates from a preset; `{ action: "test", id }` sends a signed test; `format` json/slack/discord |

Full guide: `docs/OUTREACH.md`.

## Job hub, quotes, documents, payments

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/jobs/[id]` | everything about one job: lead, quotes, invoices, payments, documents, progress, materials, shifts, messages, money (invoiced/paid/margin), checklist |
| PATCH | `/api/jobs/[id]` | fields + `status` (fires workflows/webhooks), `ensurePortal` |
| GET/POST | `/api/quotes` | `create` · `update` · `add_catalog` · `duplicate` · `generate_pdf` · `send` (PDF + email/SMS with `/q/<token>` link) · `sign` (staff) · `decline` |
| GET/POST | `/api/documents` | `generate` `{kind: quote\|contract\|invoice\|receipt\|job_report, jobId\|quoteId\|invoiceId, send?}` · `send` `{id, channels?, to?, note?}`; PDFs stored under `/api/media/*.pdf` |
| GET/POST | `/api/payments` | `record` (e-Transfer/cash/cheque) · `checkout` (Stripe URL) · `pay_link` |
| POST | `/api/payments/webhook` | Stripe (`Stripe-Signature` verified) → invoice paid → receipt |
| GET/POST | `/api/public/quote/[token]` | customer view (marks viewed) · `sign` / `decline`; `…/pdf` streams the PDF |
| GET/POST | `/api/public/pay/[token]` | customer invoice view · POST creates Stripe Checkout |
| GET/POST | `/api/public/portal/[token]` | customer job portal · POST sends a message to the crew; `…/media/[file]`, `…/doc/[id]` |
| GET/POST | `/api/public/referral/[code]` | referral landing → new lead |

## Inbox, voice, live wire, auth, media

| Method | Path | Notes |
|--------|------|-------|
| GET/POST | `/api/messages` | threads / one thread · `send` (real SMS/email) · `draft` (Claude) · `read` |
| POST | `/api/sms/inbound` | Twilio SMS webhook → thread, STOP, replies, new leads |
| POST | `/api/voice/inbound` · `/api/voice/status` · `/api/voice/voicemail` | Twilio Voice: forward to `VOICE_FORWARD_TO`, missed-call text-back, voicemail + transcription + Claude summary |
| GET | `/api/stream` | Server-Sent Events feed of `live.*` events (dashboard + `/admin/live`) |
| POST | `/api/auth/login` | sets signed httpOnly `bhc_session` cookie; lockout after 5 failures (429) |
| POST | `/api/auth/logout` | clears the cookie |
| GET | `/api/media/[file]` | photos, signatures, PDFs from `data/media` (session required) |

Auth: `src/middleware.ts` requires the session cookie on every `/api/*` route except the public allowlist (health, login, inbound webhooks, `/api/public/*`, presentations, calendar, seed, automation-with-secret). Legacy `x-bhc-user-id` header still accepted until `BHC_STRICT_AUTH=1`.

## Other CRM routes (existing)

`/api/leads` `/api/jobs` `/api/crm` `/api/invoices` `/api/progress` `/api/shifts` `/api/zones` `/api/knocks` `/api/canvass` `/api/employees` `/api/inventory` `/api/tools` `/api/fleet` `/api/fuel` `/api/materials` `/api/damage` `/api/tickets` `/api/workflows` `/api/outreach` `/api/announcements` `/api/time-entries` `/api/dashboard` `/api/stats` `/api/markets` `/api/contact`

Legacy knocks POST still exists at `/api/knocks`; new field app should use `/api/knocker`.

## CLI (same store)

```bash
npm run bhc -- ai status
npm run bhc -- ai chat "CRM summary"
npm run bhc -- ai summarize --job job-1
npm run bhc -- store summary
npm run bhc -- store health
npm run bhc -- store backup | backups | restore <file.json>
npm run bhc -- automations list | status
npm run bhc -- automations tick [--force] [--json]
npm run bhc -- automations run <id>
npm run bhc -- webhooks backlog | retry
```
