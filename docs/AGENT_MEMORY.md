# Agent memory — BHC project context

Persistent log of user preferences, decisions, and chat themes for future agents and engineers.  
**Last updated:** 2026-08-24

## How to use this file

- Read this before large UI or product changes.
- Append dated entries when the user states a preference or you ship a major decision.
- Do not store secrets (API keys, PINs beyond public demo accounts).

---

## User preferences (stable)

| Topic | Preference |
|-------|------------|
| Git | Feature branches `cursor/<kebab>-22fe`; merge verified PRs to `main` |
| Demo login | `cameron` / `1001` (admin) — not `jordan` |
| Public demo | GitHub Pages at `/BHC` — use `withBasePath()` for fetch/SW only, not Next `Link` |
| AI keys | Never commit; browser key in sidebar for Pages testing only |
| Outreach | Always `pending_approval` until real SMTP |
| Testing | User expects evidence (tests + UI walkthrough) before calling work done |

---

## Product decisions (chronological)

### Public site & rebrand

- Seaside Contracting UI ported 1:1 and rebranded **BH Contracting Co.**
- Fixed dark-hero nav/CTA contrast, manifest, hero layering.
- Staff entry via **Staff login** on gate + header → `/login`.

### Auth & store

- Login migrated from `jordan` → `cameron`; storage keys bumped (`bhc-auth-*`, `bhc-crm-store-v8`).
- `?next=` redirect supported after login.
- Single JSON store (`data/store.json`) + localStorage mirror for static demo.

### CLI & server AI (merged PR #5)

- `npm run bhc -- ai status|chat|summarize`, `store summary`, `automations …`
- Gemini preferred, OpenAI fallback, local parser fallback.
- Mainframe tool schemas expanded; `GET /api/ai/status`.

### Client AI & Active Knocker base (merged PR #6)

- `src/lib/ai-client.ts`, `AiKeyPanel` on `/admin/assistant`.
- Knocker command center, Leaflet map, `/apps/knocker`, `/admin/knocker`.
- Geo utils: RDP, PIP, cluster, route; store **v8**.

### Production knocker + docs (merged PR #7)

- Calendar: ICS + Google template + `GET /api/calendar`.
- Push: Notification API, `public/sw.js`, due-task reminders.
- Signatures: `SignaturePad` on Propose tab.
- GPS: distance filter, accuracy, wake lock, battery backoff.
- Webhooks: HMAC `X-BHC-Signature`, delivery log.
- Full doc set: `CLAUDE.md`, `docs/HANDOFF`, `ARCHITECTURE`, `API`, `DEPLOYMENT`, `USAGE`, `KNOCKER`, `AI`.

### JARVIS intelligence UI (2026-08-24)

**User feedback:** Bar felt “dead” — dots highlighted but no insight; animations felt random.

**Shipped behavior:**

- Live **metric chips** (pipeline $, doors today, open shifts, alerts) above the bar.
- **Expandable detail panel** on bar click or dot select: breakdown rows, entity list, primary/secondary actions.
- Richer `buildJarvisInsights()` from full `AppData`: knocker todos, proposals, notifications, automations due, urgent tickets, pinned announcements.
- Tone-colored orb + category chips; rotation pauses on hover/expand; typing only when collapsed.
- CSS cleanup: removed duplicate rules, dropped global `.jarvis-content > *` fade, slower border gradient, `prefers-reduced-motion` support.
- **HUD deck strip:** compact `JarvisBar variant="hud"` sits above the radial dock on `/admin/dashboard` (expand panel grows upward; no typewriter).
- Metric chips and pipeline graph nodes expand the matching briefing card; action buttons in the panel still navigate.

**Key files:** `src/lib/jarvis-briefing.ts`, `src/components/JarvisBar.tsx`, `src/components/JarvisDetailPanel.tsx`, `src/app/admin/dashboard/page.tsx`, `src/app/globals.css` (JARVIS + HUD blocks).

### Tutorials walkthrough (2026-08-24)

**User request:** Full tutorials page covering every aspect of the system with role-based access.

**Shipped:**
- `src/lib/tutorials.ts` — modules + ordered role paths for admin/manager/sales/knocker/field/office/driver
- `/admin/tutorials` + `/apps/tutorials` — interactive guide with role preview, start-here path, search, permission cheat sheet
- Nav: Administration → Tutorials (`board` so every role can open it); Field hub card

---

## Chat themes (for continuity)

1. **Make the app feel alive** — user wants data surfaced in UI, not buried in store/API.
2. **Knocker parity with Active Knocker** — map, turfs, GPS, routes, chat, leaderboard, proposals.
3. **AI everywhere but safe** — Mainframe + CLI + optional browser Gemini; no auto-send outreach.
4. **Transfer-friendly docs** — every major area documented for handoff to Claude/other agents.

---

## Known backlog (do not re-discover)

1. Postgres / object storage for photos and scale.
2. GoDaddy SMTP for real outreach send.
3. Google Calendar OAuth (`events.insert`).
4. Web Push VAPID for cross-device push.
5. Capacitor/native wrap for background GPS.
6. httpOnly session cookies + PIN lockout.
7. Multi-tenant stores.

---

## Verification checklist (default)

```bash
npm test
npm run lint
npm run build
```

Manual: login `cameron`/`1001` → surface under change (e.g. `/admin/sales`, `/apps/knocker`, JARVIS expand on dashboard).

---

## Demo URLs & accounts

| Resource | Value |
|----------|--------|
| Pages demo | https://gemsns.github.io/BHC/ |
| Admin | `cameron` / `1001` |
| Knocker | `jamie` / `1007` |
| Field | `sam` / `1003` |
| Driver | `riley` / `1005` |
