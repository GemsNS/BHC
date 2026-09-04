# Intuit Developer — app settings for BH Contracting LTD.

Production domain: **`bhcontracting.ca`**

Use these exact values in the [Intuit Developer Portal](https://developer.intuit.com/) so you can reveal the **client secret** and complete OAuth setup.

---

## App settings → Legal

| Field | URL |
|-------|-----|
| **End-user license agreement** | `https://bhcontracting.ca/legal/terms` |
| **Privacy policy** | `https://bhcontracting.ca/legal/privacy` |

These pages ship with the app at `/legal/terms` and `/legal/privacy`.

---

## App settings → Redirect URIs

Add **both** during development and production:

| Environment | Redirect URI |
|-------------|----------------|
| Intuit Quick Start (playground only) | `https://developer.intuit.com/app/developer/quickstart` |
| **BHC production (required)** | `https://bhcontracting.ca/api/quickbooks/callback` |

Local development (optional):

| Environment | Redirect URI |
|-------------|----------------|
| Local dev | `http://localhost:3000/api/quickbooks/callback` |

---

## App settings → Host domain, launch, disconnect, connect

| Field | Value |
|-------|--------|
| **Host domain** | `bhcontracting.ca` |
| **Launch URL** | `https://bhcontracting.ca/admin/books` |
| **Disconnect URL** | `https://bhcontracting.ca/api/quickbooks/disconnect` |
| **Connect / Reconnect URL** | `https://bhcontracting.ca/api/quickbooks/connect` |

Copy-paste block:

```
Host domain:     bhcontracting.ca
Launch URL:      https://bhcontracting.ca/admin/books
Disconnect URL:  https://bhcontracting.ca/api/quickbooks/disconnect
Connect URL:     https://bhcontracting.ca/api/quickbooks/connect
Redirect URI:    https://bhcontracting.ca/api/quickbooks/callback
EULA:            https://bhcontracting.ca/legal/terms
Privacy:         https://bhcontracting.ca/legal/privacy
```

---

## Keys & credentials (production)

| Setting | Value |
|---------|--------|
| **Client ID** | `ABjjo711bpbnbvXjltyVOzX6MTarqryRWdlit5rHvF6a6Q97Kt` |
| **Client secret** | Server `.env` only as `QUICKBOOKS_CLIENT_SECRET` — **never commit** |
| **Scopes** | `com.intuit.quickbooks.accounting` `com.intuit.quickbooks.payment` `openid` `profile` `email` `phone` `address` |
| **Environment** | **Production** (`QUICKBOOKS_ENV=production`) |

> Previous sandbox client ID (`ABEgigfqrSofBmosED1aGbcsIEJLqBcNWyffWvL1lehMjzcsdV`) is retired — use production keys above.

---

## Server `.env` (production)

```bash
APP_BASE_URL=https://bhcontracting.ca

QUICKBOOKS_CLIENT_ID=ABjjo711bpbnbvXjltyVOzX6MTarqryRWdlit5rHvF6a6Q97Kt
QUICKBOOKS_CLIENT_SECRET=<server-only — never commit>
QUICKBOOKS_ENV=production
QUICKBOOKS_REDIRECT_URI=https://bhcontracting.ca/api/quickbooks/callback
```

Tokens are stored automatically in `data/qb-connection.json` after OAuth — no need to set `QUICKBOOKS_REALM_ID` or `QUICKBOOKS_REFRESH_TOKEN` manually.

Send the **client secret** to your agent in chat only — do not commit it to git.

---

## OAuth flow (Admin → Books)

1. Set `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET` in server `.env`
2. Deploy and restart the app
3. Log in as admin → **Admin → Books**
4. Click **Connect QuickBooks** → authorize your **production** QuickBooks company
5. Callback saves tokens server-side; click **Fetch 2-year P&L**

API routes:

- `POST /api/quickbooks/connect` — start OAuth (returns `authorizeUrl`)
- `GET /api/quickbooks/callback` — Intuit redirect (exchanges code)
- `POST /api/quickbooks/disconnect` — clear stored tokens
- `GET /api/quickbooks/status` — connection status
- `POST /api/quickbooks/pnl` — fetch P&L (empty body uses server OAuth)

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
curl -sI https://bhcontracting.ca/legal/privacy | head -3
curl -sI https://bhcontracting.ca/legal/terms | head -3
curl -sI https://bhcontracting.ca/contracts/snow/Snow-Removal-Service-Agreement.pdf | head -3
```

If PR #15 is not merged yet, deploy the branch directly:

```bash
git fetch origin cursor/production-ready-contracts-22fe
git checkout cursor/production-ready-contracts-22fe
git pull origin cursor/production-ready-contracts-22fe
npm ci && npm run build && sudo systemctl restart bhc
```

Append production QuickBooks vars to server `.env` (edit with `nano .env`):

```bash
APP_BASE_URL=https://bhcontracting.ca
QUICKBOOKS_CLIENT_ID=ABjjo711bpbnbvXjltyVOzX6MTarqryRWdlit5rHvF6a6Q97Kt
QUICKBOOKS_CLIENT_SECRET=<paste production secret>
QUICKBOOKS_ENV=production
QUICKBOOKS_REDIRECT_URI=https://bhcontracting.ca/api/quickbooks/callback
```

Then restart: `sudo systemctl restart bhc`

Verify OAuth routes are live:

```bash
curl -sI https://bhcontracting.ca/api/quickbooks/status | head -3
# Expect 401 (auth required) or 200 — not 404
```

---

## Snow contract (direct link)

After deploy:

- PDF: `https://bhcontracting.ca/contracts/snow/Snow-Removal-Service-Agreement.pdf`
- Short URL (primary doc): `https://bhcontracting.ca/contracts/snow`

CRM sync in Mainframe: **`sync contract snow`**

---

Reference: [Intuit OAuth 2.0](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)
