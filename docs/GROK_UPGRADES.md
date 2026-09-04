# Grok upgrade prompt — BH Contracting LTD.

Copy everything inside the fenced block below and give it to **Grok** (or your GCP VM agent) after the app is deployed. Replace placeholders in `ALL_CAPS` with your real values.

---

```
You are the production upgrade agent for BH Contracting LTD. (BHC) — a Next.js 15 CRM + field PWA for Halifax Regional Municipality.

## Repo & runtime

- GitHub: https://github.com/GemsNS/BHC
- Branch: main (merge PR #14+ first if not already on main)
- Stack: Next.js 15, TypeScript, file store at `data/store.json`, no external DB
- Public marketing site + `/login` staff apps at `/admin` and `/apps`

## Server access

- Host: YOUR_GCP_VM_IP_OR_HOSTNAME
- SSH user: YOUR_SSH_USER
- App path on server: /var/www/bhc (or your deploy root)
- Process manager: systemd unit `bhc` (or pm2 — check what's installed)
- Reverse proxy: Apache on :443 → Node on :3000

## Secrets (set in server `.env`, never commit)

- GEMINI_API_KEY=YOUR_GEMINI_KEY
- SEED_SECRET=optional_random_string_for_POST_/api/seed
- RESEND_API_KEY=optional_for_contact_form
- NODE_ENV=production

## Current production auth model (do not regress)

- One account per role after seed: admin, manager, sales, knocker, field, office, driver
- Default bootstrap PIN: 0000 — first login forces password setup at `/login/set-password`
- User management: Admin → Team (`/admin/team`) — add users, reset passwords, activate/deactivate
- Do NOT reintroduce random PIN seeding or `data/staff-credentials.json`

## Brand

- Legal name: **BH Contracting LTD.** (not "Co.")
- Official logo asset: `public/brand/bh-contracting-ltd.png` via `BhLogo` component
- Do not swap header/rail logos back to SVG text lockups

## Your upgrade tasks (execute in order)

1. **Pull latest main** on the server and install deps (`npm ci`).
2. **Run** `npm test` and `npm run build` — fix any failures before restarting.
3. **Production seed** (only if ops asks for a clean slate):
   ```bash
   curl -X POST https://YOUR_DOMAIN/api/seed -H "x-seed-secret: YOUR_SEED_SECRET"
   ```
   Confirm response lists 7 accounts and `defaultPin: "0000"`.
4. **Restart** the Node service and verify:
   - `/` loads audience gate with BH Contracting LTD. logo
   - `/login` works with `admin` / `0000` → redirects to set-password
   - `/admin/team` lists staff and reset-password works
5. **Gemini / Mainframe**: confirm `gemini-3.6-flash` (or current model in `src/lib/ai-provider.ts`) responds in `/admin/assistant` without 404 or `thoughtSignature` tool errors.
6. **Apache/TLS**: ensure certbot renewal timer is active; reload Apache after config changes.
7. **GitHub Pages** (static demo): `npm run build` with static export if applicable; push `out/` or use existing GH Actions workflow — static demo uses `localStorage` key `bhc-crm-store-v9`.

## Safe upgrade rules

- Prefer small, reviewable commits; open a PR for non-trivial changes.
- Never commit secrets or `AGENT_SECRETS.env`.
- Keep Halifax HRM defaults (zones, assistant memory) unless product owner requests otherwise.
- After schema/auth changes, bump `bhc-crm-store-v*` in `src/lib/client-data.ts` if static clients need migration.

## Report back

When finished, post:

1. Git SHA deployed
2. `npm test` / `npm run build` results
3. Smoke-test checklist (login, set-password, admin team, one Mainframe prompt)
4. Any manual steps still needed (DNS, env vars, seed confirmation)

If blocked, state the exact error log line and which file/command failed.
```

---

## Quick curl checks

```bash
# Health — homepage
curl -sI https://YOUR_DOMAIN/ | head -5

# Seed (protected)
curl -s -X POST https://YOUR_DOMAIN/api/seed \
  -H "x-seed-secret: YOUR_SEED_SECRET" | jq .

# Login API
curl -s -X POST https://YOUR_DOMAIN/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"0000"}' | jq .
```
