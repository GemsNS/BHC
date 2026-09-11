# Grokbot handback — God's Eye View (HRM)

CRM tab: **Admin → Overview → God's Eye View** (`/admin/gods-eye`).

Upstream reference (MIT code): [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view).  
Third-party **data** keeps its own licenses — do not assume MIT covers Esri/Google/OpenSky/etc.

---

## What shipped vs deferred

| Shipped in BHC | Deferred (optional later) |
|----------------|---------------------------|
| Feature-flagged admin tab, default **OFF** | Full Cesium globe vendored into Next 15 |
| HRM default center `44.6488°N, 63.5752°W` | Live aircraft / AIS / satellites / voice |
| Keyless **Esri World Imagery** + **OSM** Leaflet basemap | Photoreal Google 3D Tiles / Cesium ion terrain |
| Kill-switch so CRM stays up when GEV is off | Pinokio / standalone GEV Node 24+ runtime |
| Optional iframe via `GODS_EYE_EMBED_URL` | Bundling TeleGeography / non-commercial datasets |

**Why not full GEV in-process:** upstream needs Node ≥24, Cesium assets, and many BYOK feeds. Embedding a controlled Leaflet HRM view (or iframe to a separately hosted GEV) keeps Next 15 CI green and leaves a hard kill-switch.

---

## Kill-switch (mandatory)

Default is **OFF**. Mirror both flags so server + client nav agree:

```bash
# Disable (safe default — hide nav, page shows disabled panel, no tile load)
GODS_EYE_ENABLED=0
NEXT_PUBLIC_GODS_EYE_ENABLED=0
```

```bash
# Enable HRM ops map
GODS_EYE_ENABLED=1
NEXT_PUBLIC_GODS_EYE_ENABLED=1
```

Then restart the Node/Next process (`deploy/production/deploy.sh` or `systemctl restart` as you usually do).

**Important:** `NEXT_PUBLIC_*` is inlined at **build** time. Changing the public kill-switch requires a rebuild (`npm run build` / deploy script), not only a process restart. Keep `GODS_EYE_ENABLED` equal to `NEXT_PUBLIC_GODS_EYE_ENABLED`.

With the flag off:

- Nav item is hidden (rail, mobile chips, command palette)
- Direct URL `/admin/gods-eye` shows a safe disabled panel (no crash)
- Rest of CRM is unaffected

---

## Env vars

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `GODS_EYE_ENABLED` | Yes to enable | Server kill-switch (`0`/`1`, default `0`) |
| `NEXT_PUBLIC_GODS_EYE_ENABLED` | Yes to enable | Client kill-switch for nav (keep equal to above) |
| `GODS_EYE_EMBED_URL` | No | Full GEV (or other) iframe target |
| `NEXT_PUBLIC_GODS_EYE_EMBED_URL` | No | Same URL exposed to the browser; CSP `frame-src` allowlists its origin at build/boot |
| `CESIUM_ION_TOKEN` / `NEXT_PUBLIC_CESIUM_ION_TOKEN` | No | Soft-fail status only today; reserved for future Cesium path |
| `GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | No | Soft-fail status only today; reserved for Google 3D tiles |

Keyless path uses Esri World Imagery + OSM — **no keys needed for HRM ops view**.

---

## Where to get optional keys (for full upstream GEV / future photoreal)

1. **Cesium ion** — https://ion.cesium.com/ → create token → `CESIUM_ION_TOKEN` / `NEXT_PUBLIC_CESIUM_ION_TOKEN`
2. **Google Maps Platform** (Map Tiles / Photorealistic 3D) — https://console.cloud.google.com/ → enable Map Tiles API → restrict key → `GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
3. Upstream GEV also documents OpenAI realtime, AISStream, TomTom, etc. — only needed if you host the **full** app separately; **not** required for BHC's Leaflet HRM tab.

Restrict keys by HTTP referrer / IP. Never commit secrets; put them only in the production env file Grokbot already manages.

---

## Enable steps (production)

1. Edit `/opt/bhc/.env` (or your standard env path):
   ```bash
   GODS_EYE_ENABLED=1
   NEXT_PUBLIC_GODS_EYE_ENABLED=1
   ```
2. Optional embed of a self-hosted GEV build:
   ```bash
   GODS_EYE_EMBED_URL=https://gev.yourdomain.example/
   NEXT_PUBLIC_GODS_EYE_EMBED_URL=https://gev.yourdomain.example/
   ```
   Rebuild/restart so Next CSP `frame-src` picks up the origin.
3. Deploy / restart Next (`bash deploy/production/deploy.sh` or equivalent).
4. Sign in as an admin with `dashboard` permission → **God's Eye View**.
5. Confirm satellite basemap loads over HRM and attribution remains visible.

## Disable steps

```bash
GODS_EYE_ENABLED=0
NEXT_PUBLIC_GODS_EYE_ENABLED=0
# optionally blank embed URLs
# GODS_EYE_EMBED_URL=
# NEXT_PUBLIC_GODS_EYE_EMBED_URL=
```

Restart. Nav disappears; CRM unchanged.

---

## Deploy / CSP notes

- `src/lib/security-headers.ts` already allows OSM + Esri `connect-src` and `frame-src 'self'` (+ embed origin when set).
- `img-src` already permits `https:` (tiles).
- Soft-fail: malformed `GODS_EYE_EMBED_URL` is ignored for CSP instead of breaking headers.
- Apache mirror: no change required for keyless tiles; if you add a separate GEV vhost, keep TLS + do not weaken global `frame-ancestors`.

---

## Grokbot checklist

- [ ] Confirm both enable flags default to `0` in prod until ops asks
- [ ] When enabling: set **both** `GODS_EYE_ENABLED` and `NEXT_PUBLIC_GODS_EYE_ENABLED`
- [ ] Restart after any `NEXT_PUBLIC_*` change (inlined at build on some pipelines — prefer rebuild)
- [ ] Optional: provision Cesium ion + Google Maps keys only if photoreal / full GEV is requested
- [ ] If hosting full GEV: respect DATA_SOURCES licenses; strip TeleGeography for commercial use
- [ ] Smoke: login → Overview nav without GEV when off; with flag on, map centers on HRM

Code pointers: `src/lib/gods-eye.ts`, `src/app/admin/gods-eye/page.tsx`, `src/components/gods-eye/GodsEyeMap.tsx`.
