# Walid Warehouse — customer presentation (password protected)

Two views behind the same password:

| URL | What it is |
|-----|------------|
| `https://bhcontracting.ca/presentations/walid` | **Clean presentation** (Manus design) |
| `https://bhcontracting.ca/presentations/walid/raw` | **Raw package view** (full file inventory + documents) |
| `https://bhcontracting.ca/presentations/walid/view/` | Fullscreen clean presentation |

**Password:** `walid`

## Deploy

```bash
cd /opt/bhc
git fetch origin
git checkout main
git pull origin main
npm ci && npm run build && sudo systemctl restart bhc
```

Smoke test:

```bash
curl -s https://bhcontracting.ca/api/presentations/walid/status
# → unlocked:false

curl -s -c /tmp/walid.ck -X POST https://bhcontracting.ca/api/presentations/walid/unlock \
  -H 'Content-Type: application/json' \
  -d '{"password":"walid"}'

curl -s -b /tmp/walid.ck -o /dev/null -w '%{http_code}\n' \
  https://bhcontracting.ca/presentations/walid/view/
# → 200
```

## Layout on disk

```
presentations/walid/
  meta.json                 # password SHA-256
  manifest.json             # raw view inventory
  clean/                    # Manus static presentation (telemetry removed)
  package/                  # full package for raw view + ZIP
  BH_Contracting_Walid_Complete_Package.zip
```

Share only the password-protected URL with the customer — not linked from the public marketing site.
