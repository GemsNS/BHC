# AI platform

## Providers

Resolved in `src/lib/ai-provider.ts`:

1. `AI_PROVIDER` override if set
2. Else `GEMINI_API_KEY` or `GOOGLE_API_KEY` → Gemini (`x-goog-api-key`)
3. Else `OPENAI_API_KEY` → OpenAI-compatible chat completions + tools
4. Else local heuristics / Mainframe regex parser

Browser (Pages): `src/lib/ai-client.ts` uses `localStorage bhc-gemini-api-key` or `NEXT_PUBLIC_GEMINI_API_KEY`.

## Surfaces

| Surface | Path |
|---------|------|
| Mainframe chat | `/admin/assistant`, floating launcher |
| Progress summarize | `/apps/progress`, `/admin/progress`, invoices |
| CLI | `npm run bhc -- ai *` |
| Status | `GET /api/ai/status` |

## Mainframe tools

Defined in `src/lib/mainframe-tools.ts`, schemas in `mainframe-agent.ts`:

`get_summary` `list_leads` `create_lead` `update_lead_status` `list_jobs` `create_invoice` `run_workflow` `process_sequences` `approve_outreach` `find_prospects` `hunt_leads` `save_criteria_profile` `create_task` `run_daily_automations`

Outreach is **never auto-sent** (`pending_approval`).

## Security

- Server keys only in `.env`
- Client keys are extractable — label as TEST in UI
- Do not log API keys
- AQ. Gemini auth keys may 401 from restricted IPs; use a key allowed for the host

## Local fallback

If no key: `parseLocalIntent` understands phrases like “CRM summary”, “Hunt leads”, “Create lead: …”.
