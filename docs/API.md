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

Verify: HMAC-SHA256 of the **raw JSON body** with endpoint `secret`. Events: `pin.created`, `pin.updated`, `proposal.created`, `proposal.signed`, `todo.created`, `todo.completed`, `territory.created`, `automation.ran`.

Deliveries are stored in `webhookDeliveries` (last 200). Failed HTTP is logged; no automatic retry loop yet (future).

## Other CRM routes (existing)

`/api/leads` `/api/jobs` `/api/crm` `/api/invoices` `/api/progress` `/api/shifts` `/api/zones` `/api/knocks` `/api/canvass` `/api/employees` `/api/inventory` `/api/tools` `/api/fleet` `/api/fuel` `/api/materials` `/api/damage` `/api/tickets` `/api/workflows` `/api/outreach` `/api/announcements` `/api/time-entries` `/api/dashboard` `/api/stats` `/api/markets` `/api/contact`

Legacy knocks POST still exists at `/api/knocks`; new field app should use `/api/knocker`.

## CLI (same store)

```bash
npm run bhc -- ai status
npm run bhc -- ai chat "CRM summary"
npm run bhc -- ai summarize --job job-1
npm run bhc -- store summary
npm run bhc -- automations list
npm run bhc -- automations run-daily --force
```
