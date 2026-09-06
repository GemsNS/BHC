# GrokBot prompt — wire Claude via AgentRouter (fix Mainframe local mode)

Paste the **PROMPT** block into GrokBot.

## Why Mainframe is dumb right now

Without a working Claude key, Mainframe runs **LOCAL MODE**: a regex/tool parser that answers “hi / what time is it” with CRM summaries and automation ticks. That matches what you’re seeing.

Also: until this deploy lands, BHC hardcoded `https://api.anthropic.com`. AgentRouter keys only work after `ANTHROPIC_BASE_URL` support is on the host (shipped in the same change as this doc).

Live Wire “reconnecting” and dead automation buttons are separate (SSE/auth/API). Fix Claude first; then re-check those.

---

## PROMPT (paste into GrokBot)

```
You are GrokBot on the BH Contracting (BHC) production host (/opt/bhc, https://bhcontracting.ca).

## Mission
1. Pull latest main (includes ANTHROPIC_BASE_URL support for AgentRouter) and deploy.
2. Interactively create/sign in to AgentRouter with the OWNER (hand browser control for signup/2FA).
3. Create an API token and wire it into /opt/bhc/.env so Mainframe uses Claude through AgentRouter.
4. Verify AI status + a live Mainframe chat reply.
5. Write /opt/bhc/docs/GROKBOT_AGENTROUTER_REPORT.md with what worked / what failed.

## Hard rules
- NEVER commit .env or the sk- token to git
- NEVER reseed / wipe store / reset staff passwords
- Do NOT buy Anthropic console.anthropic.com billing unless owner explicitly asks — use AgentRouter
- Prefer hand-control to owner for agentrouter.org signup / CAPTCHA / 2FA
- After .env changes: restart systemd unit `bhc`

## Phase 0 — Deploy latest code (required for AgentRouter)

```bash
set -euo pipefail
cd /opt/bhc
cp -a .env ".env.bak.$(date -u +%Y%m%dT%H%M%SZ)"
git fetch origin
git checkout main
git pull origin main
npm ci
bash deploy/production/deploy.sh
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://bhcontracting.ca/api/health || true
```

Confirm the running code has AgentRouter support:
```bash
grep -n 'ANTHROPIC_BASE_URL\|anthropicMessagesUrl\|agentrouter' src/lib/ai-provider.ts | head
```
If those symbols are missing, STOP and report — do not put an AgentRouter key against a build that still hardcodes api.anthropic.com.

## Phase 1 — AgentRouter account + token (interactive)

1. Open https://agentrouter.org (or /register) in the browser.
2. HAND CONTROL TO THE OWNER to create/sign in and finish CAPTCHA/2FA.
3. Take control back → Console → API Token / Tokens → Add:
   - Name: bhc-mainframe
   - Expiration: Never (or long-lived)
   - Quota: enable unlimited / use free credits as available
4. Copy the `sk-...` token once. Store only in memory / .env — never in git, never in chat logs if avoidable.

## Phase 2 — Write production env

Edit /opt/bhc/.env (upsert these keys; keep existing SESSION_SECRET / SMTP / etc.):

```bash
cd /opt/bhc
TOKEN='sk-PASTE_AGENTROUTER_TOKEN_HERE'

# Remove old AI lines we are replacing (keep backups already taken)
sed -i '/^ANTHROPIC_API_KEY=/d;/^ANTHROPIC_AUTH_TOKEN=/d;/^ANTHROPIC_BASE_URL=/d;/^ANTHROPIC_MODEL=/d;/^ANTHROPIC_FAST_MODEL=/d;/^AI_PROVIDER=/d' .env

cat >> .env <<EOF
AI_PROVIDER=anthropic
ANTHROPIC_BASE_URL=https://agentrouter.org
ANTHROPIC_API_KEY=${TOKEN}
ANTHROPIC_AUTH_TOKEN=${TOKEN}
ANTHROPIC_MODEL=claude-opus-5
ANTHROPIC_FAST_MODEL=claude-haiku-4-5
EOF

sudo systemctl restart bhc
sleep 3
curl -fsS http://127.0.0.1:3000/api/health
```

Notes:
- Base URL is `https://agentrouter.org` (no trailing path required; code accepts with or without `/v1`).
- Same `sk-` token goes in BOTH ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN.
- Do NOT set AI_PROVIDER=openai unless Anthropic-messages path fails (fallback below).

## Phase 3 — Verify Claude is live

```bash
cd /opt/bhc
npm run bhc -- ai status
```

Expect provider=anthropic, configured=true, model showing.

Smoke chat (pick whichever CLI works on this build):
```bash
npm run bhc -- ai chat "Reply with exactly: MAINFRAME_OK and the current UTC time."
```
Or via console:
```bash
npm run console
# then: ai  (or chat) — ask "what time is it in Halifax?"
```

Also hit the HTTP status endpoint if present:
```bash
curl -fsS -b /tmp/bhc.ck -c /tmp/bhc.ck -X POST https://bhcontracting.ca/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"login":"admin","password":"OWNER_OR_KNOWN_PASSWORD"}' || true
curl -fsS -b /tmp/bhc.ck https://bhcontracting.ca/api/ai/status || true
```

Success criteria:
- `ai status` shows anthropic configured
- A natural-language question (“what time is it?”) returns a normal sentence, NOT only “CRM summary: 0 open leads…” / get_summary spam

If Anthropic Messages path returns 401/404 from AgentRouter:
### Fallback — OpenAI-compatible gateway
```bash
sed -i '/^AI_PROVIDER=/d;/^OPENAI_API_KEY=/d;/^OPENAI_BASE_URL=/d;/^OPENAI_MODEL=/d' .env
cat >> .env <<EOF
AI_PROVIDER=openai
OPENAI_API_KEY=${TOKEN}
OPENAI_BASE_URL=https://agentrouter.org/v1
OPENAI_MODEL=claude-opus-5
EOF
sudo systemctl restart bhc
npm run bhc -- ai status
```
Document which path worked in the report.

## Phase 4 — Quick check on Live Wire + automation buttons

After AI works:
1. Open https://bhcontracting.ca/admin/live — note if SSE stays connected or flaps.
2. Open https://bhcontracting.ca/admin/automation — click Run / Tick once if a button exists; capture network error if any.
3. If Live Wire flaps: check cookie session (owner must re-login after SESSION_SECRET rotate), and that /api/stream returns 200 with text/event-stream while logged in.
4. Do NOT “fix” by disabling auth. Report exact status codes.

## Phase 5 — Report

Write /opt/bhc/docs/GROKBOT_AGENTROUTER_REPORT.md:

# AgentRouter → BHC Mainframe
- Date UTC
- Deployed SHA
- AgentRouter account: created/signed-in
- Token installed in .env: yes (redacted)
- ANTHROPIC_BASE_URL=
- Path used: anthropic-messages | openai-compat fallback
- `npm run bhc -- ai status` output (redact keys)
- Sample chat result (quote the reply to “what time is it?”)
- Live Wire: connected | reconnecting (+ HTTP status)
- Automation buttons: ok | failed (+ error)
- Owner follow-up: re-login if cookies stale; optional real Anthropic billing later

Print the report path + 10-line summary.
```

---

## After GrokBot finishes (you)

1. Soft-refresh `/admin/assistant`, pick **Orchestrator**, ask: `what time is it in Halifax?`
2. You should get a normal answer — not a CRM summary dump.
3. If still local-mode text, open the report and check `ai status`.
4. Optional later: real `console.anthropic.com` key + remove `ANTHROPIC_BASE_URL` to go direct.
