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
import { imapConfigured, imapSummary, pollImapInbox } from "../src/lib/ad-imap";
import { ensureBuiltinSource, ingestRawAds } from "../src/lib/ad-ingest";
import { qualifyListing, runAdIngest } from "../src/lib/ad-pipeline";
import { companyProfile } from "../src/lib/ad-classify";
import { mailConfigStatus, sendEmail } from "../src/lib/mail";
import { processOutreachQueue, sendPolicy } from "../src/lib/outreach-send";
import { runServerTick, serverSenders } from "../src/lib/scheduler";
import { sendSms, smsConfigStatus } from "../src/lib/sms";
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
  store reseed --yes            Wipe CRM data to a clean seed; KEEP staff accounts on PIN 0000
    --fresh-staff               Replace staff with the default role accounts instead
    --drop-optouts              Also drop the do-not-contact list (kept by default)

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

  ads status                    Job-ad outreach: connections, sources, inbox counts
  ads ingest                    Poll sources, triage new ads, create leads + drafts
  ads add "<title>" [options]   Add one ad by hand and triage it
    --body "<text>" --url <u> --email <e> --phone <p> --name <n> --location <l>
  ads list [--all]              Ads needing attention (or everything)
  ads send                      Send approved replies now (email/SMS)
  ads test-email <to>           Send a test email through SMTP/Resend
  ads test-sms <to>             Send a test SMS through Twilio
  ads purge-fake                Cancel synthetic outreach + remove junk search-result ads

  auth reset <login>            Clear password → PIN 0000; must set password next login
  auth set-password <login> --password <pw>
                                Set a password directly (ops recovery)
  auth reset-link <login>       Create a one-hour reset URL (prints link; emails if SMTP up)

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

async function cmdStoreReseed() {
  const keepStaff = !flag("fresh-staff");
  const keepOptOuts = !flag("drop-optouts");
  if (!flag("yes")) {
    console.error(
      `This replaces ALL CRM data (leads, jobs, invoices, ads, messages, documents, automations, webhooks) with a clean seed.\n` +
        (keepStaff ? "Staff accounts are KEPT, each reset to PIN 0000 + must-set-password.\n" : "Staff accounts are replaced by the default role accounts (admin, sales, …) on PIN 0000.\n") +
        (keepOptOuts ? "The do-not-contact (opt-out) list is kept.\n" : "The opt-out list is DROPPED.\n") +
        `A backup is written to data/backups/pre-reseed-*.json first.\n\nRe-run with --yes to proceed.`,
    );
    process.exit(2);
  }
  const { reseedStore } = await import("../src/lib/reseed");
  const current = await readStore();
  const backup = await createBackup({ label: "pre-reseed" });
  const { data, staff, keptOptOuts } = reseedStore(current, { keepStaff, keepOptOuts });
  await writeStore(data);
  console.log(`Reseeded. Backup: ${backup?.name ?? "(none — no store existed)"}`);
  console.log(`${staff} staff account(s) on PIN 0000 (must set password on next sign-in)${keptOptOuts ? ` · ${keptOptOuts} opt-out(s) kept` : ""}`);
  for (const e of data.employees) console.log(`  ${e.active ? "●" : "○"} ${e.login.padEnd(14)} ${e.role.padEnd(8)} ${e.name}`);
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

async function cmdAdsStatus() {
  const data = await readStore();
  const ai = getAIStatus();
  const mail = mailConfigStatus();
  const sms = smsConfigStatus();
  const imap = imapSummary();
  const policy = sendPolicy();
  const on = (b: boolean) => (b ? "●" : "○");
  console.log("Connections:");
  console.log(`  ${on(ai.configured)} AI        ${ai.configured ? `${ai.provider} · ${ai.model}` : "not configured (rules-only triage) — set ANTHROPIC_API_KEY"}`);
  console.log(`  ${on(mail.configured)} Email     ${mail.configured ? `${mail.provider} · from ${mail.from}` : "not configured — SMTP_* or RESEND_API_KEY"}`);
  console.log(`  ${on(sms.configured)} SMS       ${sms.configured ? `twilio · ${sms.from}` : "not configured — TWILIO_*"}`);
  console.log(`  ${on(imap.configured)} Mailbox   ${imap.configured ? `${imap.user} · ${imap.host} · ${imap.folder}` : "not configured — ADS_IMAP_*"}`);
  console.log(`  ${on(Boolean(process.env.ADS_INBOUND_SECRET))} Webhook   POST /api/ads/inbound ${process.env.ADS_INBOUND_SECRET ? "enabled" : "(set ADS_INBOUND_SECRET)"}`);
  console.log(
    `\nPolicy: auto-send ${policy.autosend.size ? [...policy.autosend].join("+") + ` (score ≥ ${policy.autosendMinScore})` : "OFF (approve each reply)"} · cap ${policy.dailyCap}/day · SMS quiet ${policy.quietStart}-${policy.quietEnd}h · follow-up after ${policy.followUpDays}d`,
  );
  const c = companyProfile();
  console.log(`Signature: ${c.signer} · ${c.name} · ${c.phone || "(no OUTREACH_REPLY_PHONE)"} · ${c.email}`);
  console.log(`\nSources (${data.adSources.length}):`);
  for (const s of data.adSources) {
    console.log(`  ${on(s.enabled)} ${s.type.padEnd(7)} ${s.name}${s.url ? `  ${s.url}` : ""}  last ${s.lastPolledAt ?? "never"}${s.lastError ? `  ! ${s.lastError}` : ""}`);
  }
  const by = (st: string) => data.adListings.filter((a) => a.status === st).length;
  console.log(
    `\nAds: ${data.adListings.length} total · ${by("new")} new · ${by("drafted") + by("qualified")} drafted · ${by("sent")} sent · ${by("replied")} replied · ${by("won")} won · ${by("skipped")} skipped`,
  );
  console.log(`Replies awaiting approval: ${data.outreachQueue.filter((o) => o.adId && o.status === "pending_approval").length}`);
}

async function cmdAdsIngest() {
  let summary = "";
  let errors: string[] = [];
  await updateStoreAsync(async (d) => {
    const r = await runAdIngest(d, { newId, nowIso, pollImap: imapConfigured() ? pollImapInbox : undefined });
    summary = r.summary;
    errors = r.errors;
  });
  console.log(summary);
  for (const e of errors) console.log(`  ! ${e}`);
}

async function cmdAdsAdd(title: string) {
  if (!title) {
    console.error('Usage: bhc ads add "<title>" [--body ...] [--url ...] [--email ...] [--phone ...]');
    process.exit(1);
  }
  await updateStoreAsync(async (d) => {
    const src = ensureBuiltinSource(d, "manual", { newId, nowIso });
    const created = ingestRawAds(
      d,
      src,
      [
        {
          title,
          body: opt("body") ?? "",
          url: opt("url"),
          contactEmail: opt("email"),
          contactPhone: opt("phone"),
          contactName: opt("name"),
          location: opt("location"),
          postedAt: nowIso(),
        },
      ],
      { newId, nowIso },
    );
    if (!created[0]) {
      console.log("Duplicate — an ad with this title/URL already exists.");
      return;
    }
    const r = await qualifyListing(d, created[0], { newId, nowIso }, { force: flag("force") });
    const ad = created[0];
    console.log(`${ad.status.toUpperCase()} · score ${ad.score} · ${ad.category} · ${ad.summary}`);
    for (const reason of ad.reasons) console.log(`  - ${reason}`);
    for (const draft of r.drafts) {
      console.log(`\n[${draft.channel}] ${draft.status} → ${draft.channel === "sms" ? draft.prospectPhone : draft.prospectEmail || "(platform)"}`);
      if (draft.channel !== "sms") console.log(`Subject: ${draft.subject}`);
      console.log(draft.message);
    }
  });
}

async function cmdAdsList() {
  const data = await readStore();
  const all = flag("all");
  const rows = data.adListings.filter((a) => all || a.status === "new" || a.status === "drafted" || a.status === "qualified");
  if (!rows.length) {
    console.log(all ? "No ads." : "Nothing needs attention.");
    return;
  }
  for (const a of rows) {
    const drafts = data.outreachQueue.filter((o) => o.adId === a.id);
    console.log(
      `${String(a.score).padStart(3)}  ${a.status.padEnd(9)} ${a.category.padEnd(20)} ${a.title.slice(0, 60).padEnd(60)} ${a.sourceName}  ${drafts.length ? `drafts: ${drafts.map((d) => `${d.channel}/${d.status}`).join(",")}` : ""}`,
    );
  }
}

async function cmdAdsSend() {
  const senders = serverSenders();
  if (!senders.email && !senders.sms) {
    console.error("No sender configured. Set SMTP_*/RESEND_API_KEY for email and/or TWILIO_* for SMS.");
    process.exit(1);
  }
  let summary = "";
  await updateStoreAsync(async (d) => {
    const r = await processOutreachQueue(d, { newId, nowIso }, senders);
    summary = r.summary;
  });
  console.log(summary);
}

async function cmdAdsTest(channel: "email" | "sms", to: string) {
  if (!to) {
    console.error(`Usage: bhc ads test-${channel} <to>`);
    process.exit(1);
  }
  const c = companyProfile();
  const r =
    channel === "sms"
      ? await sendSms({ to, body: `Test from ${c.shortName} CRM — SMS outreach is connected. Reply STOP to opt out.` })
      : await sendEmail({ to, subject: `Test — ${c.name} CRM outreach`, text: `Email outreach is connected.\n\n${c.signer}\n${c.name}` });
  console.log(r.ok ? `OK via ${r.provider} (${r.id ?? "no id"})` : `FAILED: ${r.error}`);
  if (!r.ok) process.exitCode = 1;
}

async function cmdAdsPurgeFake() {
  const { purgeSyntheticOutreachAndAds } = await import("../src/lib/outreach-guard");
  let summary = "";
  await updateStoreAsync(async (d) => {
    const r = purgeSyntheticOutreachAndAds(d);
    summary = r.notes.join(" ") || "Nothing to purge.";
  });
  console.log(summary);
}

async function cmdAuthReset(login: string) {
  if (!login) {
    console.error("Usage: bhc auth reset <login>");
    process.exit(1);
  }
  const { bootstrapStaffPassword, findStaffByLoginOrEmail } = await import(
    "../src/lib/password-reset"
  );
  const { DEFAULT_STAFF_PIN } = await import("../src/lib/auth-credentials");
  let found = false;
  await updateStoreAsync(async (d) => {
    const emp = findStaffByLoginOrEmail(d, login);
    if (!emp) return;
    bootstrapStaffPassword(emp);
    found = true;
    console.log(
      `Reset ${emp.login} (${emp.name}) → PIN ${DEFAULT_STAFF_PIN}; must set password on next login.`,
    );
  });
  if (!found) {
    console.error(`No active staff matching "${login}"`);
    process.exit(1);
  }
}

async function cmdAuthSetPassword(login: string) {
  const password = opt("password");
  if (!login || !password) {
    console.error("Usage: bhc auth set-password <login> --password <pw>");
    process.exit(1);
  }
  if (password.trim().length < 6) {
    console.error("Password must be at least 6 characters");
    process.exit(1);
  }
  const { findStaffByLoginOrEmail } = await import("../src/lib/password-reset");
  const { hashPassword } = await import("../src/lib/auth-credentials");
  let found = false;
  await updateStoreAsync(async (d) => {
    const emp = findStaffByLoginOrEmail(d, login);
    if (!emp) return;
    emp.passwordHash = hashPassword(password);
    emp.mustChangePassword = false;
    found = true;
    console.log(`Password updated for ${emp.login} (${emp.name}).`);
  });
  if (!found) {
    console.error(`No active staff matching "${login}"`);
    process.exit(1);
  }
}

async function cmdAuthResetLink(login: string) {
  if (!login) {
    console.error("Usage: bhc auth reset-link <login>");
    process.exit(1);
  }
  const {
    findStaffByLoginOrEmail,
    issuePasswordResetToken,
    passwordResetUrl,
    sendPasswordResetEmail,
  } = await import("../src/lib/password-reset");
  let url: string | null = null;
  let email: string | null = null;
  let name = "";
  let loginName = "";
  let raw = "";
  await updateStoreAsync(async (d) => {
    const emp = findStaffByLoginOrEmail(d, login);
    if (!emp) return;
    const issued = issuePasswordResetToken(d, emp.id, { newId, nowIso });
    raw = issued.rawToken;
    url = passwordResetUrl(raw);
    email = emp.email;
    name = emp.name;
    loginName = emp.login;
  });
  if (!url) {
    console.error(`No active staff matching "${login}"`);
    process.exit(1);
  }
  const toEmail = email ?? "";
  console.log(`Reset link for ${loginName} (valid ~1 hour):\n${url}`);
  if (toEmail.includes("@")) {
    const sent = await sendPasswordResetEmail({
      to: toEmail,
      name,
      login: loginName,
      rawToken: raw,
    });
    console.log(
      sent.ok
        ? `Also emailed ${toEmail}.`
        : `Email not sent (${sent.error}). Use the link above.`,
    );
  } else {
    console.log("No email on file — use the link above.");
  }
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
    if (sub === "reseed") return cmdStoreReseed();
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

  if (cmd === "ads") {
    if (sub === "status") return cmdAdsStatus();
    if (sub === "ingest") return cmdAdsIngest();
    if (sub === "add") return cmdAdsAdd(args[2] ?? "");
    if (sub === "list") return cmdAdsList();
    if (sub === "send") return cmdAdsSend();
    if (sub === "test-email") return cmdAdsTest("email", args[2] ?? "");
    if (sub === "test-sms") return cmdAdsTest("sms", args[2] ?? "");
    if (sub === "purge-fake") return cmdAdsPurgeFake();
    console.error(`Unknown ads subcommand: ${sub ?? "(none)"}`);
    process.exit(1);
  }

  if (cmd === "auth") {
    if (sub === "reset") return cmdAuthReset(args[2] ?? "");
    if (sub === "set-password") return cmdAuthSetPassword(args[2] ?? "");
    if (sub === "reset-link") return cmdAuthResetLink(args[2] ?? "");
    console.error(`Unknown auth subcommand: ${sub ?? "(none)"}`);
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
