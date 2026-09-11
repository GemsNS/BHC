# DNS + HTTP security (Claude audit fixes)

Fixes from the 2026-09 security audit against **bhcontracting.ca**.

| # | Finding | Fix |
|---|---------|-----|
| 1 | SPF is GoDaddy-only (`include:secureserver.net`) while MX/DKIM are Microsoft 365 | Add `include:spf.protection.outlook.com` |
| 2 | DMARC `p=quarantine` | Raise to `p=reject` after SPF includes Outlook |
| 3 | Missing HSTS / X-Content-Type-Options / CSP | Next.js `headers()` + Apache conf |
| 4 | `Server: Apache/2.4.52` + `X-Powered-By: Next.js` | `poweredByHeader: false`, `ServerTokens Prod`, unset `X-Powered-By` |

---

## 1. DNS — apply in GoDaddy (required, not in git)

DNS is authoritative at GoDaddy (current SPF still points at `secureserver.net`). Claude / Cursor **cannot** change these records without GoDaddy DNS API credentials — an operator must paste them.

### SPF (`bhcontracting.ca` TXT)

**Current (broken for M365 senders):**

```text
v=spf1 include:secureserver.net -all
```

**Replace with:**

```text
v=spf1 include:spf.protection.outlook.com include:secureserver.net -all
```

Keep `include:secureserver.net` only if any GoDaddy Workspace / legacy SMTP still sends as `@bhcontracting.ca`. If everything is M365, Outlook-only is enough:

```text
v=spf1 include:spf.protection.outlook.com -all
```

### DMARC (`_dmarc.bhcontracting.ca` TXT)

**Current:**

```text
v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;
```

**After SPF is updated and a few M365 messages show SPF=pass / DKIM=pass**, replace with:

```text
v=DMARC1; p=reject; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;
```

### Verify

```bash
dig +short TXT bhcontracting.ca | grep spf
dig +short TXT _dmarc.bhcontracting.ca
# Expect Outlook include in SPF and p=reject in DMARC
```

Optional: send a test to a Gmail inbox → “Show original” → SPF/DKIM/DMARC PASS.

Canonical strings also live in `src/lib/security-headers.ts` (`DNS_SPF_RECORD`, `DNS_DMARC_RECORD`).

---

## 2. HTTP headers — in this repo (deploy)

| Layer | What |
|-------|------|
| `next.config.ts` | `poweredByHeader: false` + security headers on `/:path*` |
| `src/lib/security-headers.ts` | HSTS, XCTO, CSP, frame/referrer/permissions policies |
| `deploy/production/apache-bhc-security.conf` | `ServerTokens Prod`, strip `X-Powered-By`, mirror HSTS/XCTO |
| `deploy/production/install-apache-security.sh` | One-shot install + `apache2` reload |

CSP also allowlists Leaflet OSM + Esri World Imagery (`server.arcgisonline.com`) for the optional God's Eye HRM map, and `frame-src 'self'` plus `GODS_EYE_EMBED_URL` origin when set. See `docs/GROKBOT_GODS_EYE_HANDBACK.md`.

**On the host after merge:**

```bash
cd /opt/bhc && bash deploy/production/deploy.sh
sudo bash deploy/production/install-apache-security.sh
curl -sSI https://bhcontracting.ca/ | grep -iE 'strict-transport|x-content-type|content-security|x-powered|server:'
```

Expect:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Content-Security-Policy: …`
- **No** `X-Powered-By: Next.js`
- `Server:` at most `Apache` (no version) once `ServerTokens Prod` is active

---

## 3. Relation to leads handoff

Do this **before** Claude owns automated leads / outbound email. Wrong SPF makes outreach from M365 look spoofed to receivers even when DKIM aligns.
