# Automation engine

BHC runs a set of unattended jobs over the same `AppData` store the CRM uses. Nothing here sends customer email or changes money: the engine **creates in-app alerts and tasks, advances sequences, retries webhooks, and takes backups**. Business-changing workflows (create a job, draft an invoice) exist as templates but ship **paused**.

Surfaces:

| Surface | Where |
|---------|-------|
| Admin UI | `/admin/automation` (Administration → Automation hub) |
| Event workflows | `/admin/sales?tab=automation` |
| API | `GET/POST /api/automation`, `GET /api/health` |
| CLI | `npm run bhc -- automations tick\|status`, `store backup\|health`, `webhooks retry` |
| Mainframe AI | tools `automation_status`, `toggle_automation`, `store_health`, `run_daily_automations` |
| JARVIS | "Automation" metric chip + briefing card on the dashboard |

## How a tick works

`runAutomationTick(data, opts)` in `src/lib/automation-engine.ts`:

1. For every **enabled + due** automation in `data.assistantAutomations`, run its action.
2. Run any `trigger: "scheduled"` workflows that have not run today.
3. Deliver pending webhooks and retry failed ones whose backoff has elapsed.
4. Append an `AutomationTickRecord` to `data.automationRuns` (capped at 60) with counters, per-step results, and errors.

Every check is **idempotent**: alerts carry a `dedupeKey` and tasks are looked up by subject + record before creation, so a tick can run every 15 minutes without spamming anyone.

### Due rules

| Kind | Rule |
|------|------|
| Interval (`intervalMinutes`) | due when that many minutes have passed since `lastRunAt` |
| Daily (`runHour`) | due when the server-local hour ≥ `runHour` and it has not run today |
| `force` | ignore schedule (UI "Force-run all", CLI `--force`, API `force: true`) |

## Automation catalog

Defined in `src/lib/automation-defaults.ts`. `normalizeStore` adds any missing entries to existing stores (operator enable/disable choices are preserved).

| id | Action | Schedule | Default | What it does |
|----|--------|----------|---------|--------------|
| `auto-pipeline` | `pipeline_scan` | daily 7am | on | Follow-up task for `new`/`contacted` leads idle 3+ days |
| `auto-task-reminders` | `task_reminders` | every 15 min | on | Alerts for knocker to-dos due ≤15 min / overdue (sets `reminderSentAt`) and overdue CRM tasks |
| `auto-sequences` | `process_sequences` | hourly | on | Logs the due step of each active sales sequence |
| `auto-invoice-followup` | `invoice_followup` | daily 8am | on | `sent` invoice older than `AUTOMATION_INVOICE_DUE_DAYS` (30) → "Collect payment" task + alert; stale drafts → alert |
| `auto-job-health` | `job_health` | daily 8am | on | In-progress job with no site update in 5 days; completed job with no invoice → task; missed start date |
| `auto-inventory` | `inventory_reorder` | daily 6am | on | Stock ≤ reorder level → alert |
| `auto-tools` | `tool_overdue` | daily 9am | on | Checkout older than 7 days → reminder to borrower |
| `auto-damage` | `damage_escalation` | daily 9am | on | High/critical damage unresolved 24h → alert |
| `auto-fleet` | `fleet_check` | daily 7am | on | Vehicles in maintenance / no ping in 3 days |
| `auto-digest` | `daily_digest` | daily 7am | on | One summary alert: leads, jobs, shifts, invoices, tasks, stock |
| `auto-webhook-retry` | `webhook_retry` | every 15 min | on | Deliver pending + retry failed webhooks (server only) |
| `auto-backup` | `store_backup` | daily 2am | on | Snapshot `data/store.json` → `data/backups/` (server only) |
| `auto-prospects` | `prospect_hunt` | daily 10am | off | Queue outreach drafts (still `pending_approval`) |
| `auto-outreach-digest` | `outreach_digest` | daily 4pm | off | Count of drafts awaiting approval |

Thresholds are env-tunable (`AUTOMATION_*`, see `.env.example`).

## Event workflows

`src/lib/workflows.ts`. Triggers now cover the whole ops loop:

`lead_created` · `lead_status_changed` · `shift_posted_pool` · `job_created` · `job_status_changed` · `invoice_status_changed` · `proposal_signed` · `damage_reported` · `ticket_created` · `scheduled` · `manual`

Filters: `triggerConfig.status` (lead/job/invoice) and `triggerConfig.severity` (damage). `scheduled` uses `triggerConfig.hour`.

Actions: `create_task` · `log_email` · `assign_lead` · `enroll_sequence` · `create_ticket` · `notify` (announcement) · `find_prospects` · `queue_outreach` · **`create_notification`** · **`send_webhook`** · **`create_job_from_lead`** · **`create_invoice_draft`** · **`update_lead_status`**

Routes that fire hooks: `/api/leads`, `/api/jobs`, `/api/invoices` (PATCH), `/api/damage`, `/api/crm` (`create_ticket`), `/api/knocker` (`sign_proposal`), `/api/shifts`, `/api/canvass`, `/api/knocks`, and the Mainframe tools.

### Templates (shipped paused)

| id | Trigger | Actions |
|----|---------|---------|
| `wf-lead-won-job` | lead status = won | create job from lead, notify |
| `wf-job-completed-invoice` | job status = completed | draft invoice, notify |
| `wf-damage-critical` | damage severity = critical | notify, webhook `damage.reported` |
| `wf-proposal-signed` | proposal signed | task "Schedule signed proposal", notify |

Enable in Sales → Automation. They are safe to re-run: `create_job_from_lead` and `create_invoice_draft` skip when a record already exists.

## Webhooks

`src/lib/webhooks.ts`. Every outbound POST is signed (`X-BHC-Signature: sha256=<hmac>`) and now carries `X-BHC-Delivery` and `X-BHC-Attempt`. Failures schedule `nextRetryAt` with exponential backoff (5 → 10 → 20 → 40 min) up to **5 attempts**, then the delivery is abandoned with `completedAt` set. `queueWebhook` lets synchronous code (workflow actions, browser demo) enqueue without sending; the engine flushes the queue.

New events: `lead.created`, `lead.status_changed`, `job.created`, `job.status_changed`, `invoice.status_changed`, `damage.reported`, `ticket.created`, `workflow.ran`, `automation.tick`.

## Scheduler (Node host)

`src/instrumentation.ts` → `startScheduler()` when the server boots (Node runtime only; skipped for the static export and during `next build`). Default cadence 15 minutes, first tick 45 s after boot, overlap-guarded.

| Env | Default | Meaning |
|-----|---------|---------|
| `BHC_SCHEDULER` | `1` | `0` disables the in-process scheduler |
| `BHC_SCHEDULER_INTERVAL_MIN` | `15` | tick cadence |
| `BHC_SCHEDULER_INITIAL_DELAY_SEC` | `45` | first tick after boot |
| `AUTOMATION_SECRET` | — | enables `POST /api/automation` from cron/CI via `x-bhc-automation-secret` |
| `BHC_BACKUP_KEEP` | `14` | snapshots retained in `data/backups/` |

External alternatives (set `BHC_SCHEDULER=0` to avoid double ticks):

- systemd: `deploy/production/bhc-automation.service` + `.timer`
- cron: `*/15 * * * * cd /opt/bhc && npx --yes tsx scripts/bhc-cli.ts automations tick`
- GitHub Actions nightly (`.github/workflows/nightly.yml`) posts a tick with `AUTOMATION_SECRET`

## API

```
GET  /api/automation            scheduler info, status, health, backups, recent ticks, alerts, webhook backlog
POST /api/automation            { action: "tick", force? }
                                { action: "run", ids: [...] }
                                { action: "toggle", id, enabled? }
                                { action: "backup", name? }
                                { action: "restore", name }           (admin)
                                { action: "retry_webhooks" }
                                { action: "mark_read", ids? }
                                { action: "clear_notifications" }
GET  /api/health                public liveness: store ok, scheduler, ai/mail providers (200 / 503)
```

Auth for `/api/automation`: admin/manager session header **or** `x-bhc-automation-secret`. In development with no secret configured the route is open on localhost.

## Backups & health

- `npm run bhc -- store backup` / `store backups` / `store restore <file>` (restore takes a `pre-restore-*` safety copy first)
- `npm run bhc -- store health` — size, per-collection counts, dangling references, bootstrap-PIN accounts, duplicate logins
- Deploy script also writes `data/backups/pre-deploy-*.json` before every release

## Browser demo

On GitHub Pages the hub still works: ticks run in the browser against localStorage (`network: false`, no backups). The scheduler card shows "browser".

## Adding an automation

1. Add the action name to `AutomationActionName` in `types.ts`.
2. Implement a pure check in `automation-checks.ts` (use `notifyOnce` / `createTaskOnce`).
3. Route it in `runAutomationDetailed` (`mainframe-automations.ts`).
4. Add a catalog entry in `automation-defaults.ts` (id, schedule, `defaultEnabled`).
5. Test idempotency in `tests/automation-engine.test.ts`.
