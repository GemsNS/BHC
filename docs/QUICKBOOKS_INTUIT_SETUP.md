# Intuit Developer — app settings for BH Contracting LTD.

Use these values in the [Intuit Developer Portal](https://developer.intuit.com/) so you can reveal the **client secret** and complete OAuth setup.

Replace `YOUR_DOMAIN` with your production hostname (HTTPS), e.g. `app.bhcontracting.ca` or your GCP VM domain.

---

## App settings → Legal

| Field | URL |
|-------|-----|
| **End-user license agreement** | `https://YOUR_DOMAIN/legal/terms` |
| **Privacy policy** | `https://YOUR_DOMAIN/legal/privacy` |

These pages ship with the app at `/legal/terms` and `/legal/privacy`.

---

## App settings → Redirect URIs

Add **both** during development and production:

| Environment | Redirect URI |
|-------------|----------------|
| Intuit Quick Start (playground only) | `https://developer.intuit.com/app/developer/quickstart` |
| **Your app (required for BHC)** | `https://YOUR_DOMAIN/api/quickbooks/callback` |

The Quick Start URI is only for Intuit’s sandbox playground. The BHC app will use `/api/quickbooks/callback` once OAuth routes are merged.

---

## App settings → Host domain, launch, disconnect, connect

| Field | Value |
|-------|--------|
| **Host domain** | `YOUR_DOMAIN` (hostname only, no `https://`) |
| **Launch URL** | `https://YOUR_DOMAIN/admin/books` |
| **Disconnect URL** | `https://YOUR_DOMAIN/api/quickbooks/disconnect` |
| **Connect / Reconnect URL** | `https://YOUR_DOMAIN/api/quickbooks/connect` |

Example if your domain is `app.bhcontracting.ca`:

```
Host domain:     app.bhcontracting.ca
Launch URL:      https://app.bhcontracting.ca/admin/books
Disconnect URL:  https://app.bhcontracting.ca/api/quickbooks/disconnect
Connect URL:     https://app.bhcontracting.ca/api/quickbooks/connect
Redirect URI:    https://app.bhcontracting.ca/api/quickbooks/callback
EULA:            https://app.bhcontracting.ca/legal/terms
Privacy:         https://app.bhcontracting.ca/legal/privacy
```

---

## Keys & credentials (after legal URLs are saved)

| Setting | Value |
|---------|--------|
| **Client ID** | `ABEgigfqrSofBmosED1aGbcsIEJLqBcNWyffWvL1lehMjzcsdV` |
| **Client secret** | Copy from Keys page → store in server `.env` as `QUICKBOOKS_CLIENT_SECRET` — **never commit** |
| **Scopes** | `com.intuit.quickbooks.accounting` `com.intuit.quickbooks.payment` `openid` `profile` `email` `phone` `address` |
| **Environment** | Sandbox (for development) |

---

## Server `.env` (after you have the secret)

```bash
QUICKBOOKS_CLIENT_ID=ABEgigfqrSofBmosED1aGbcsIEJLqBcNWyffWvL1lehMjzcsdV
QUICKBOOKS_CLIENT_SECRET=<paste from Intuit Keys page>
QUICKBOOKS_ENV=sandbox
QUICKBOOKS_REDIRECT_URI=https://YOUR_DOMAIN/api/quickbooks/callback
```

After OAuth completes, you will also set:

```bash
QUICKBOOKS_REALM_ID=<sandbox company id from callback>
QUICKBOOKS_REFRESH_TOKEN=<from token exchange>
```

Send the **client secret** to your agent in chat only — do not commit it to git.

---

## Deploy commands (GCP / Node server)

SSH to the server, then:

```bash
cd /var/www/bhc   # or your app root

git fetch origin
git checkout main
git pull origin main

npm ci
npm run build

# Ensure .env has GEMINI_API_KEY, SEED_SECRET, QuickBooks vars, etc.
sudo systemctl restart bhc    # or: pm2 restart bhc

# Smoke tests
curl -sI https://YOUR_DOMAIN/legal/privacy | head -3
curl -sI https://YOUR_DOMAIN/legal/terms | head -3
curl -sI https://YOUR_DOMAIN/contracts/snow/Snow-Removal-Service-Agreement.pdf | head -3
```

If PR #15 is not merged yet, deploy the branch directly:

```bash
git fetch origin cursor/production-ready-contracts-22fe
git checkout cursor/production-ready-contracts-22fe
git pull origin cursor/production-ready-contracts-22fe
npm ci && npm run build && sudo systemctl restart bhc
```

---

## Snow contract (direct link)

After deploy:

- PDF: `https://YOUR_DOMAIN/contracts/snow/Snow-Removal-Service-Agreement.pdf`
- Short URL (primary doc): `https://YOUR_DOMAIN/contracts/snow`

CRM sync in Mainframe: **`sync contract snow`**

---

## Next step — OAuth scaffold

Reply with:

1. **Your production `YOUR_DOMAIN`** (so URLs above are exact)
2. **Client secret** (from Intuit Keys page, after legal URLs are saved)
3. **Framework** — recommend **Next.js / TypeScript** (matches this repo); say if you prefer Node CLI instead

We will add `/api/quickbooks/connect`, `/callback`, `/disconnect`, server-side token storage, and refresh — replacing the current browser localStorage credential form on Admin → Books.

Reference: [Intuit OAuth 2.0](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)
