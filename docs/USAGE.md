# Usage guide

## Staff login

1. Open `/login` (or **Staff login** on the public site).
2. Demo admin: **cameron** / **1001**. Knocker: **jamie** / **1007**.
3. Session is stored in the browser. Logout from the shell header.

## Surfaces

| You want | Go to |
|----------|-------|
| Public marketing | `/` `/residential` `/commercial` `/showcase` |
| Ops HUD | `/admin/dashboard` (`?classic=1` for list wall) |
| Mainframe AI | `/admin/assistant` or floating MAINFRAME |
| Sales CRM | `/admin/sales` |
| Active Knocker (command) | `/admin/knocker` |
| Active Knocker (field) | `/apps/knocker` |
| Field hub | `/apps` |
| Schedule | `/admin/schedule` / `/apps/schedule` |
| Markets | `/admin/markets` |

## Enable AI (full stack)

1. Put `GEMINI_API_KEY=` in `.env`
2. Restart `npm run dev`
3. Chat on `/admin/assistant` — badge shows GEMINI
4. CLI: `npm run bhc -- ai chat "CRM summary"`

## Enable AI on GitHub Pages (temporary)

1. Log in as admin
2. `/admin/assistant` → **BROWSER AI KEY (TEST)** → paste Gemini key → Save
3. Key stays in `localStorage` (`bhc-gemini-api-key`)
4. Clear when done

## Active Knocker — daily field flow

1. Open `/apps/knocker`, allow **location**
2. **Map**: pick zone · **Draw turf** (tap ≥3 points) · **Close polygon**
3. **Drop pin** or use **Pin** tab: address, tags, outcome, optional CRM lead
4. Double-knock: saving a known address returns an error unless “allow duplicate”
5. **Route**: sequenced stops + Google / Apple / Waze
6. **Tasks**: add follow-up + due datetime → **Google** or **.ics**
7. **Enable push** for due reminders (browser permission)
8. **Propose**: select pin → products/services → **Build proposal** → sign canvas → **Capture sign-off**
9. **Team**: leaderboard + chat
10. **Stats**: conversion + **GPS profile** (distance filter, accuracy, wake lock)

## Calendar

- Tasks with due dates create `knockCalendarEvents`
- **Google** opens Calendar template (user confirms)
- **.ics** downloads RFC5545 for Apple/Outlook/Google import
- Server feed: `GET /api/calendar`

## Webhooks (admin / integrations)

```bash
curl -X POST http://localhost:3000/api/webhooks \
  -H 'Content-Type: application/json' \
  -d '{"name":"CRM","url":"https://example.com/hooks/bhc","events":["pin.created","proposal.signed"]}'
```

Save the returned `secret`. Verify `X-BHC-Signature`.

## Reset demo data

```bash
curl -X POST http://localhost:3000/api/seed
```

On Pages, clear site data / localStorage key `bhc-crm-store-v8`.
