# AI platform

## Providers

Resolved in `src/lib/ai-provider.ts` (preference order when `AI_PROVIDER` unset):

1. `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY` → **Claude** (preferred for Mainframe CRM)
2. `GEMINI_API_KEY` / `GOOGLE_API_KEY` → Gemini
3. `OPENAI_API_KEY` → OpenAI-compatible chat + tools
4. Else local heuristics / Mainframe regex parser

Override with `AI_PROVIDER=anthropic|gemini|openai`.

Browser (Pages static demo): `src/lib/ai-client.ts` still uses Gemini localStorage / `NEXT_PUBLIC_GEMINI_*` only.

## Surfaces

| Surface | Path |
|---------|------|
| Mainframe chat | `/admin/assistant`, floating launcher |
| Progress summarize | `/apps/progress`, `/admin/progress` (auth required) |
| Uploads | `POST /api/uploads`, `GET /api/uploads/:id` |
| CLI | `npm run bhc -- ai *` |
| Status | `GET /api/ai/status` (includes usage + agents) |

## Multi-agent Mainframe

Agents in `src/lib/mainframe-agents.ts`:

| Id | Role |
|----|------|
| `orchestrator` | Default router |
| `crm` | Leads/jobs/invoices/outreach |
| `estimator` | Quantities / contracts |
| `research` | HRM + hunt + memory |
| `design` | Design / Manus-style presentation honesty |

UI: agent chips + file Attach on `/admin/assistant`.

## Rate limits, quotas, captchas

| Control | Module / env |
|---------|----------------|
| Per-IP / per-user throttles | `src/lib/rate-limit.ts` |
| Daily AI request + token budget | `src/lib/ai-budget.ts` → `data/ai-usage.json` |
| Turnstile / hCaptcha | `src/lib/captcha.ts` (skipped when secret unset) |
| Contact honeypot | hidden `website` field |
| Presentation unlock lockout | `PRESENTATION_UNLOCK_RATE_PER_HOUR` |

See `.env.example` for all knobs.

## Mainframe tools

Defined in `src/lib/mainframe-tools.ts` / CRM tools. Outreach is **never auto-sent** (`pending_approval`).

## Security

- Server keys only in `.env`
- Client Gemini keys are extractable — label as TEST in UI
- Do not log API keys
- Uploads: auth required, MIME allow-list, size + rate limits, stored under `data/uploads/`
