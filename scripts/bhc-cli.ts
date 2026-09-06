#!/usr/bin/env node
/**
 * BHC command-line interface — CRM ops, AI chat, automations.
 *
 * Usage:
 *   npm run bhc -- ai status
 *   npm run bhc -- ai chat "CRM summary"
 *   npm run bhc -- ai summarize --job job-1
 *   npm run bhc -- store summary
 *   npm run bhc -- automations list
 *   npm run bhc -- automations run-daily [--force]
 */

import "dotenv/config";
import { getAIStatus } from "../src/lib/ai-provider";
import { summarizeProgress } from "../src/lib/ai-summarize";
import { automationStatus } from "../src/lib/automation-engine";
import { runMainframeTurn, type ChatMessage } from "../src/lib/mainframe-agent";
import { automationsDue, runAutomation, runDailyAutomations } from "../src/lib/mainframe-automations";
import { executeMainframeTool } from "../src/lib/mainframe-tools";
import { runServerTick } from "../src/lib/scheduler";
import { createBackup, listBackups, restoreBackup } from "../src/lib/store-backup";
import { storeHealth } from "../src/lib/store-health";
import { newId, nowIso, readStore, updateStoreAsync, writeStore } from "../src/lib/store";
import { deliverPendingWebhooks, webhookBacklog } from "../src/lib/webhooks";

const args = process.argv.slice(2);

function flag(name: string): boolean {
  return args.includes(`--${name}`);
}

function opt(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i >= args.length - 1) return undefined;
  return args[i + 1];
}

function restAfter(sub: string[]): string {
  const idx = args.findIndex((a, i) => sub.every((s, j) => args[i + j] === s));
  if (idx === -1) return "";
  return args.slice(idx + sub.length).join(" ").trim();
}

function printHelp() {
  console.log(`BHC CLI — BH Contracting Co. command center

Usage:
  npm run bhc -- <command> [options]

Commands:
  ai status                     Show AI provider configuration
  ai chat "<message>"           Run one Mainframe turn (Gemini/OpenAI or local)
  ai summarize [options]        Summarize job progress notes
    --job <jobId>               Load notes from store job
    --title <text>              Job title override
    --customer <name>           Customer name override
    --notes "a|b|c"             Pipe-separated notes
    --photos <n>                Photo count

  store summary                 CRM ops summary from local store
  store health                  Integrity report (size, counts, dangling refs)
  store backup [--label x]      Snapshot data/store.json → data/backups/
  store backups                 List snapshots
  store restore <file.json>     Restore a snapshot (safety copy taken first)

  automations list              List automations + due status
  automations status            Engine status: last tick, backlog, due
  automations tick              Full engine tick (checks, sequences, webhooks, backup)
    --force                     Run every enabled automation regardless of schedule
    --json                      Print the tick record as JSON
  automations run-daily         Legacy: run due automations (no webhooks/backup)
    --force                     Run all enabled automations
  automations run <id>          Run one automation by id

  webhooks backlog              Deliveries waiting for retry
  webhooks retry                Retry the backlog now

Environment:
  ANTHROPIC_API_KEY             Preferred AI provider (Claude)
  GEMINI_API_KEY, GEMINI_MODEL  Google AI Studio
  OPENAI_API_KEY, OPENAI_*      OpenAI-compatible fallback
  AI_PROVIDER=anthropic|gemini|openai
  BHC_BACKUP_KEEP=14            Snapshots to keep
`);
}

async function cmdAiStatus() {
  const status = getAIStatus();
  console.log(JSON.stringify(status, null, 2));
  if (!status.configured) {
    console.error("\nNo AI key configured. Set GEMINI_API_KEY or OPENAI_API_KEY in .env");
    process.exitCode = 1;
  }
}

async function cmdAiChat(message: string) {
  if (!message) {
    console.error("Usage: bhc ai chat \"your message\"");
    process.exit(1);
  }
  const data = await readStore();
  const messages: ChatMessage[] = [{ role: "user", content: message }];
  const result = await runMainframeTurn(data, messages, {
    authorId: "emp-admin",
    newId,
    nowIso,
  });
  await writeStore(data);
  console.log(`[${result.source.toUpperCase()}] ${result.reply}`);
  if (result.toolRuns.length) {
    console.log("\nTool runs:");
    for (const t of result.toolRuns) {
      console.log(`  ${t.ok ? "✓" : "✗"} ${t.tool}: ${t.summary}`);
    }
  }
}

async function cmdAiSummarize() {
  const jobId = opt("job");
  const notesRaw = opt("notes");
  let notes = notesRaw ? notesRaw.split("|").map((n) => n.trim()) : [];
  let imageCount = Number(opt("photos") ?? "0");
  let jobTitle = opt("title") ?? "Job";
  let customerName = opt("customer") ?? "";

  if (jobId) {
    const data = await readStore();
    const job = data.jobs.find((j) => j.id === jobId);
    if (job) {
      jobTitle = job.title;
      customerName = job.customerName;
    }
    if (!notes.length) {
      const entries = data.jobProgress.filter((p) => p.jobId === jobId);
      notes = entries.map((e) => e.notes);
      imageCount = entries.reduce((s, e) => s + e.imageDataUrls.length, 0);
    }
  }

  const result = await summarizeProgress({
    jobTitle,
    customerName,
    notes,
    imageCount,
  });
  console.log(`[${result.source.toUpperCase()}]\n${result.summary}`);
}

async function cmdStoreSummary() {
  const data = await readStore();
  const result = executeMainframeTool(data, "get_summary", {}, {
    authorId: "emp-admin",
    newId,
    nowIso,
  });
  console.log(result.summary);
}

async function cmdAutomationsList() {
  const data = await readStore();
  const due = automationsDue(data);
  console.log("Daily automations:\n");
  for (const a of data.assistantAutomations) {
    const isDue = due.some((d) => d.id === a.id);
    console.log(
      `  ${a.enabled ? "●" : "○"} ${a.id}  ${a.name}  (hour ${a.runHour})${isDue ? "  [DUE]" : ""}`,
    );
    console.log(`      ${a.description}`);
    if (a.lastRunAt) console.log(`      last: ${a.lastRunAt}`);
  }
  if (due.length) {
    console.log(`\n${due.length} automation(s) due now.`);
  }
}

async function cmdAutomationsRunDaily() {
  const data = await readStore();
  const summaries = runDailyAutomations(data, newId, { force: flag("force") });
  await writeStore(data);
  for (const s of summaries) console.log(`• ${s}`);
  if (!summaries.length) console.log("No automations ran (none due). Use --force to run all enabled.");
}

async function cmdAutomationsRun(id: string) {
  if (!id) {
    console.error("Usage: bhc automations run <automationId>");
    process.exit(1);
  }
  const data = await readStore();
  const auto = data.assistantAutomations.find((a) => a.id === id);
  if (!auto) {
    console.error(`Automation not found: ${id}`);
    process.exit(1);
  }
  const summary = runAutomation(data, auto, newId);
  await writeStore(data);
  console.log(summary);
}

async function cmdAutomationsStatus() {
  const data = await readStore();
  const s = automationStatus(data);
  if (s.lastTick) {
    console.log(
      `Last tick: ${s.lastTick.finishedAt} (${s.lastTick.source}, ${s.lastTick.durationMs}ms) — ${s.lastTick.results.length} result(s), ${s.lastTick.errors.length} error(s)`,
    );
  } else {
    console.log("Last tick: never");
  }
  console.log(
    `Ticks today: ${s.ticksToday} · due now: ${s.dueCount} · webhook backlog: ${s.webhookBacklog} · unread alerts: ${s.unreadNotifications}`,
  );
  console.log("");
  for (const a of s.automations) {
    console.log(
      `  ${a.enabled ? "●" : "○"} ${a.id.padEnd(24)} ${a.schedule.padEnd(18)} ${a.due ? "[DUE] " : "      "}${a.lastRunAt ?? "never"}`,
    );
  }
  if (s.recentErrors.length) {
    console.log("\nRecent errors:");
    for (const e of s.recentErrors) console.log(`  ! ${e}`);
  }
}

async function cmdAutomationsTick() {
  const record = await runServerTick({ source: "cli", force: flag("force") });
  if (flag("json")) {
    console.log(JSON.stringify(record, null, 2));
    return;
  }
  console.log(`Tick ${record.id.slice(0, 8)} — ${record.durationMs}ms`);
  for (const r of record.results) console.log(`• ${r}`);
  for (const e of record.errors) console.log(`! ${e}`);
  if (!record.results.length && !record.errors.length) {
    console.log("Nothing was due. Use --force to run every enabled automation.");
  }
  const c = record.counters;
  console.log(
    `\n${c.automationsRun} automation(s) · ${c.notificationsCreated} alert(s) · ${c.tasksCreated} task(s) · ${c.sequenceSteps} sequence step(s) · webhooks ${c.webhooksSent} sent / ${c.webhooksFailed} failed${c.backupCreated ? " · backup written" : ""}`,
  );
  if (record.errors.length) process.exitCode = 1;
}

async function cmdStoreHealth() {
  const data = await readStore();
  const h = storeHealth(data);
  console.log(`Store: ${h.ok ? "OK" : "ERRORS"} · ${h.approxMB} MB · ${h.photoDataUrls} inline photos`);
  const keys = Object.keys(h.counts).sort();
  for (const k of keys) console.log(`  ${k.padEnd(22)} ${h.counts[k]}`);
  console.log("");
  if (!h.issues.length) console.log("No integrity issues.");
  for (const i of h.issues) console.log(`  [${i.level}] ${i.message}`);
  if (!h.ok) process.exitCode = 1;
}

async function cmdStoreBackup() {
  const info = await createBackup({ label: opt("label") ?? "manual" });
  if (!info) {
    console.log("No data/store.json yet — nothing to back up.");
    return;
  }
  console.log(`Backup written: ${info.path} (${Math.round(info.bytes / 1024)} KB)`);
}

async function cmdStoreBackups() {
  const list = await listBackups();
  if (!list.length) {
    console.log("No snapshots in data/backups/.");
    return;
  }
  for (const b of list) {
    console.log(`  ${b.createdAt}  ${String(Math.round(b.bytes / 1024)).padStart(7)} KB  ${b.name}`);
  }
}

async function cmdStoreRestore(name: string) {
  if (!name) {
    console.error("Usage: bhc store restore <file.json>");
    process.exit(1);
  }
  const result = await restoreBackup(name);
  console.log(
    `Restored ${result.restored}. Safety copy: ${result.safetyBackup ?? "none"}. Counts: ${JSON.stringify(result.counts)}`,
  );
}

async function cmdWebhooksBacklog() {
  const data = await readStore();
  const backlog = webhookBacklog(data);
  if (!backlog.length) {
    console.log("Webhook backlog is empty.");
    return;
  }
  for (const d of backlog) {
    console.log(
      `  ${d.event.padEnd(24)} attempt ${d.attempts}  retry ${d.nextRetryAt ?? "now"}  ${d.lastError ?? "pending"}`,
    );
  }
}

async function cmdWebhooksRetry() {
  let result = { sent: 0, failed: 0, abandoned: 0 };
  await updateStoreAsync(async (d) => {
    const now = nowIso();
    for (const del of webhookBacklog(d)) del.nextRetryAt = now;
    result = await deliverPendingWebhooks(d, nowIso);
  });
  console.log(`Webhooks: ${result.sent} delivered, ${result.failed} will retry, ${result.abandoned} abandoned.`);
}

async function main() {
  const cmd = args[0];
  const sub = args[1];

  if (!cmd || cmd === "help" || flag("help")) {
    printHelp();
    return;
  }

  if (cmd === "ai") {
    if (sub === "status") return cmdAiStatus();
    if (sub === "chat") return cmdAiChat(restAfter(["ai", "chat"]));
    if (sub === "summarize") return cmdAiSummarize();
    console.error(`Unknown ai subcommand: ${sub ?? "(none)"}`);
    process.exit(1);
  }

  if (cmd === "store") {
    if (sub === "summary") return cmdStoreSummary();
    if (sub === "health") return cmdStoreHealth();
    if (sub === "backup") return cmdStoreBackup();
    if (sub === "backups") return cmdStoreBackups();
    if (sub === "restore") return cmdStoreRestore(args[2] ?? "");
    console.error(`Unknown store subcommand: ${sub ?? "(none)"}`);
    process.exit(1);
  }

  if (cmd === "automations") {
    if (sub === "list") return cmdAutomationsList();
    if (sub === "status") return cmdAutomationsStatus();
    if (sub === "tick") return cmdAutomationsTick();
    if (sub === "run-daily") return cmdAutomationsRunDaily();
    if (sub === "run") return cmdAutomationsRun(args[2] ?? "");
    console.error(`Unknown automations subcommand: ${sub ?? "(none)"}`);
    process.exit(1);
  }

  if (cmd === "webhooks") {
    if (sub === "backlog") return cmdWebhooksBacklog();
    if (sub === "retry") return cmdWebhooksRetry();
    console.error(`Unknown webhooks subcommand: ${sub ?? "(none)"}`);
    process.exit(1);
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
