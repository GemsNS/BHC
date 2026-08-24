# Active Knocker

Field canvassing modeled on Active Knocker (map turfs, color pins, GPS, CRM, proposals).

## URLs

- Field: `/apps/knocker`
- Admin command: `/admin/knocker`
- API: `GET/POST /api/knocker` — see `docs/API.md`

## Map & turf

- Leaflet OSM tiles (`KnockerMap.tsx`)
- Freehand: tap path → RDP simplify (`src/lib/knocker/geo.ts`) → closed GeoJSON-like polygon
- Fill 15–30% opacity, full stroke
- Pins inside polygon batch-bound (`bindPinsToTerritory`)
- Cluster bubbles when zoomed out (`cluster.ts`)
- Color list: `DEFAULT_KNOCK_COLORS` (Not Home, Interested, Pitched, Appointment, Sold, Callback, Not Interested, DNK)

## Double-knock

`normalizeAddressKey` + `findDuplicateKnock`. API **409** unless `allowDuplicate`.

## GPS (production PWA)

Config (`gpsConfig` + localStorage `bhc-gps-config`):

| Field | Default | Meaning |
|-------|---------|---------|
| distanceFilterMeters | 25 | Ignore moves smaller than this |
| desiredAccuracy | balanced | high = GPS, low = cell/wifi, battery-safe |
| wakeLock | true | Keep screen awake while tracking |
| enabled | true | |

Implementation: `src/lib/gps-tracker.ts`. Battery &lt; 15% forces low accuracy. `visibilitychange` restarts watch (tab background). Breadcrumbs: `knockRepLocations`.

**Native reality:** browsers cannot match native background location. For production iOS always-on tracking, wrap with Capacitor Geolocation + background mode (future). The web tracker is production-ready for **in-session canvassing**.

## Calendar sync

- `create_calendar` / Tasks tab due dates → `knockCalendarEvents`
- Google Calendar: template URL (`calendar.google.com/calendar/render?action=TEMPLATE`)
- Apple/Outlook: `.ics` via `buildIcs` / `GET /api/calendar`
- OAuth `events.insert` is **not** implemented; env `GOOGLE_CALENDAR_CLIENT_ID` reserved

## Push notifications

1. User taps **Enable push** → `Notification.requestPermission`
2. Due todos within 15 minutes: `Notification` + SW `postMessage`
3. SW shows system notification and focuses `/apps/knocker` on click
4. In-app feed: `notifications[]`

VAPID Web Push (Chrome background when tab closed) needs `web-push` + keys — not required for PWA-in-use reminders.

## Proposals & signatures

- Catalog: `knockProducts` / `knockServices`
- Builder on **Propose** tab
- `SignaturePad`: pointer canvas → PNG data URL
- Status: draft → signed (`signerName`, `signedAt`, `signatureDataUrl`)
- Webhook `proposal.signed`

## Team / gamification

`buildKnockerLeaderboard`: knocks, pitches, appointments, sold, score.

## REST / ERP

Webhooks + `/api/knocker` cover pins, todos, tags, products, services, color codes, users (employees), territories.

## Tests

`tests/knocker-geo.test.ts`, `tests/knocker-prod.test.ts`
