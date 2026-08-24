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
import { runMainframeTurn, type ChatMessage } from "../src/lib/mainframe-agent";
import { automationsDue, runAutomation, runDailyAutomations } from "../src/lib/mainframe-automations";
import { executeMainframeTool } from "../src/lib/mainframe-tools";
import { newId, nowIso, readStore, writeStore } from "../src/lib/store";

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

  automations list              List daily automations + due status
  automations run-daily         Run due daily automations
    --force                     Run all enabled automations
  automations run <id>          Run one automation by id

Environment:
  GEMINI_API_KEY, GEMINI_MODEL  Preferred AI provider (Google AI Studio)
  OPENAI_API_KEY, OPENAI_*      OpenAI-compatible fallback
  AI_PROVIDER=gemini|openai     Force provider selection
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
    console.error(`Unknown store subcommand: ${sub ?? "(none)"}`);
    process.exit(1);
  }

  if (cmd === "automations") {
    if (sub === "list") return cmdAutomationsList();
    if (sub === "run-daily") return cmdAutomationsRunDaily();
    if (sub === "run") return cmdAutomationsRun(args[2] ?? "");
    console.error(`Unknown automations subcommand: ${sub ?? "(none)"}`);
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
