# Grokbot deploy — autonomous agent runtime + lead scout

Pre-ship checklist for landing Claude’s Mainframe autonomy handback on
`bhc-app-1` / https://bhcontracting.ca. Prefer **code** over older harness notes
in `GROKBOT_CURSOR_HANDBACK_2026-09-11.md` (those still say the harness cannot
approve/send; that is now **tier-gated** via `AGENT_AUTONOMY`).

Full product guide: [`AGENT_RUNTIME.md`](./AGENT_RUNTIME.md).

## Verified locally (Cursor, 2026-09-12)

| Gate | Result |
|------|--------|
| lint | 0 errors (pre-existing warnings only) |
| `tsc --noEmit` | pass |
| vitest | **290** passed |
| `next build` | pass |
| Secrets in tree | none (`.env` stays gitignored) |
| Store | **v11** additive (`agentRuns`, `scoutTasks`, `scoutRunners`); `normalizeStore` fills `[]` — **do not re-seed** |

## What goes live on Grokbot *immediately* after deploy

Prod already has `AGENT_HARNESS_ENABLED=1` and `auto-agent-ops` ON
(`GROKBOT_CURSOR_HANDBACK_2026-09-11.md`). After this SHA lands, the same
automation gains:

- wake-on-events + daily run cap
- Anthropic `web_search` (default on for Anthropic)
- `fetch_page` / `ingest_ad` / `request_web_scan` / goals
- autonomy default **`assist`** (no approve/send unless you raise the tier)

That is intentional. Cost and scan volume can rise vs the old ≤8-step hourly sweep.

## Ship (owner)

### 1. Commit + push from the Windows main checkout

```bat
cd "C:\NoOnedrive\BHC\BHC ALL IN ONE"
git add -A
git status
git commit -m "feat(agent): autonomous 24/7 Mainframe agent runtime + own-PC lead scout"
git push origin main
```

Do **not** `git add` real `.env`, `FB_SESSION_STATE`, or credential files.

### 2. Deploy on Grokbot

```bash
cd /opt/bhc
export BHC_APP_USER=www-data BHC_APP_GROUP=www-data
bash deploy/production/deploy.sh
```

Do **not** re-seed. Do **not** enable `bhc-lead-scout.service` on the GCP host —
cloud IPs are 403/429’d; the scout belongs on a residential PC (Windows installer).

### 3. Env on host (`/etc/bhc/bhc.env` **and** `/opt/bhc/.env`)

Keep existing keys. Add/confirm:

```bash
AGENT_HARNESS_ENABLED=1
AGENT_AUTONOMY=assist
AGENT_HARNESS_MAX_STEPS=12
AGENT_HARNESS_INTERVAL_MIN=60
AGENT_HARNESS_MIN_GAP_MIN=10
AGENT_HARNESS_MAX_RUNS_PER_DAY=48
AGENT_WEB_SEARCH=1
AGENT_WEB_SEARCH_MAX=5
# ADS_INBOUND_SECRET already set — required for /api/scout runners
```

Then restart so systemd picks env if you edited `/etc/bhc/bhc.env`:

```bash
sudo systemctl restart bhc
```

**Do not** set `AGENT_AUTONOMY=operate` or `full` on first ship. Outreach autosend
(`OUTREACH_AUTOSEND=email,sms`) already sends high-score drafts without the agent;
`assist` keeps the harness on reversible CRM writes + ingest/scan only.

### 4. Confirm in Admin

1. Admin → Automation → **Autonomous agent** panel shows status / last run.
2. Leave **Mainframe ops sweep (AI agent)** enabled (already ON in prod).
3. Optional: **Run agent now** once; watch `## DID` / `## NEEDS HUMAN`.
4. **Lead scout (your PC)** panel stays empty until a runner heartbeats.

CLI on host:

```bash
sudo -u www-data bash -lc 'cd /opt/bhc && set -a && source /etc/bhc/bhc.env && set +a && ./node_modules/.bin/tsx scripts/bhc-cli.ts agent status'
```

### 5. Own-PC scout (not Grokbot)

On the office/home Windows box that has a residential IP:

```powershell
# in the same repo (or a deploy checkout), .env must contain:
#   BHC_BASE_URL=https://bhcontracting.ca
#   ADS_INBOUND_SECRET=<same as production>
#   SCOUT_RUNNER_NAME=Office PC

powershell -ExecutionPolicy Bypass -File deploy\windows\install-lead-scout.ps1
# smoke first if you prefer:
# npm run scout -- --once --dry-run
```

Runner should show **online** in Admin → Automation → Lead scout within ~1 minute.
Optional Facebook: `npm run scout -- --login` → set `FB_SESSION_STATE` outside git.

## Kill-switches

| Want | How |
|------|-----|
| Stop agent AI calls | `AGENT_HARNESS_ENABLED=0` + restart, and/or disable `auto-agent-ops` in UI |
| Stop new web searches only | `AGENT_WEB_SEARCH=0` + restart |
| Stop scout posts | stop the Windows task / leave runner offline (queue just waits) |
| Stop customer sends | `OUTREACH_AUTOSEND=` empty + restart (unchanged) |

## Known gaps (OK to ship)

- Live Anthropic `web_search` inside the harness loop and Facebook Playwright path
  were not exercised against production services; unit tests cover the same code paths.
- Kijiji / Craigslist / Reddit adapters were dry-run hardened on the authoring PC.
- Older handback text claiming “harness cannot approve/send” is obsolete: that is
  true at `assist` (default); `operate` / `full` open gated approve/send.

## Autonomy cheat-sheet (prod)

| Tier | Agent may | Keep for later |
|------|-----------|----------------|
| `observe` | read + report | first canary if nervous |
| `assist` | **ship default** — ingest, scans, tasks, lead updates | — |
| `operate` | + score-gated `approve_outreach` | only after watching assists |
| `full` | + `send_outreach` under existing outreach policy | rarely needed with autosend ON |
