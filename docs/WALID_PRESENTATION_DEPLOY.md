# Walid Warehouse — customer presentation (password protected)

All-in-one web presentation of **BH_Contracting_Walid_Complete_Package**.  
Every original file is hosted unchanged. Password: set by owner (default for this project: `walid`).

## Public URL (after deploy)

```
https://bhcontracting.ca/presentations/walid
```

Customer enters password **`walid`** on the lock screen. Session cookie lasts 14 days.

## What is included

| Area | Contents |
|------|----------|
| Overview | Full `00_README.md` (unchanged) |
| 3D Model | Interactive viewer + all model files (`.glb`, `.obj`, `.stl`, `.3mf`, `.jscad.js`, validation notes) |
| Plans & Takeoff | Elevations (PNG/SVG/DXF), takeoff XLSX/CSV, design brief, dimension register, quantity basis |
| Contract | All four contract documents as Markdown **and** DOCX |
| Renderings | All four WEBP views |
| Downloads | Every package file + complete ZIP |

Source tree on the server:

```
presentations/walid/
  meta.json          # password hash (SHA-256), never plaintext
  manifest.json      # section map + file inventory
  BH_Contracting_Walid_Complete_Package.zip
  package/           # exact package folders 00–04
```

## Deploy to production

```bash
cd /opt/bhc
git fetch origin cursor/walid-presentation-22fe
git checkout cursor/walid-presentation-22fe
git pull origin cursor/walid-presentation-22fe

npm ci
npm run build
sudo systemctl restart bhc
```

Smoke test:

```bash
# Locked status (no cookie)
curl -s https://bhcontracting.ca/api/presentations/walid/status
# → {"ok":true,"unlocked":false,...}

# Unlock
curl -s -c /tmp/walid.ck -X POST https://bhcontracting.ca/api/presentations/walid/unlock \
  -H 'Content-Type: application/json' \
  -d '{"password":"walid"}'

# Fetch a protected file
curl -s -b /tmp/walid.ck -o /tmp/readme.md \
  https://bhcontracting.ca/presentations/walid/files/00_README.md
head -3 /tmp/readme.md
```

Open in a browser: `https://bhcontracting.ca/presentations/walid` → password `walid`.

## Change the password later

1. Compute hash: `node -e "console.log(require('crypto').createHash('sha256').update('NEWPASS').digest('hex'))"`
2. Put the hex string in `presentations/walid/meta.json` → `passwordSha256`
3. Rebuild and restart

Do **not** store the plaintext password in the repo.

## Notes

- Link is **not** linked from the public marketing site — share the URL directly with the customer.
- Files require a valid unlock cookie; direct file URLs return `401` until unlocked.
