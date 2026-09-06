#!/usr/bin/env node
/**
 * BHC Console — interactive command line for the whole CRM.
 *
 *   npm run console
 *
 * Type `help` for commands. Anything that is not a command is sent to
 * Mainframe AI (Claude) as a natural-language request with CRM tools.
 * Works against the local store (data/store.json) and the same libraries the
 * web app uses, so every change shows up in the browser immediately.
 */

import "dotenv/config";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";
import readline from "readline";
import { imapConfigured, imapSummary, pollImapInbox } from "../src/lib/ad-imap";
import { ensureBuiltinSource, ingestRawAds, newAdSource } from "../src/lib/ad-ingest";
import { companyProfile } from "../src/lib/ad-classify";
import { qualifyListing, runAdIngest } from "../src/lib/ad-pipeline";
import { getAIStatus } from "../src/lib/ai-provider";
import { automationStatus } from "../src/lib/automation-engine";
import { mailConfigStatus } from "../src/lib/mail";
import { runMainframeTurn, type ChatMessage } from "../src/lib/mainframe-agent";
import { isAutomationDue } from "../src/lib/mainframe-automations";
import { markAdReplied, processOutreachQueue, recordOptOut, sendPolicy } from "../src/lib/outreach-send";
import { runServerTick, serverSenders } from "../src/lib/scheduler";
import { smsConfigStatus } from "../src/lib/sms";
import { createBackup, listBackups, restoreBackup } from "../src/lib/store-backup";
import { storeHealth } from "../src/lib/store-health";
import { newId, nowIso, readStore, storePaths, updateStore, updateStoreAsync } from "../src/lib/store";
import {
  ALL_WEBHOOK_EVENTS,
  WEBHOOK_PRESETS,
  deliverPendingWebhooks,
  endpointFromPreset,
  queueWebhook,
  randomWebhookSecret,
  webhookBacklog,
} from "../src/lib/webhooks";
import { onJobStatusChanged, onLeadCreated, onLeadStatusChanged } from "../src/lib/workflows";
import { ROLE_LABELS, type AppData, type Lead, type LeadStatus, type JobStatus, type WebhookEventName } from "../src/lib/types";

/* ------------------------------- styling ------------------------------- */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  dim: (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
  green: (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  amber: (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  cyan: (s: string) => (useColor ? `\x1b[36m${s}\x1b[0m` : s),
  magenta: (s: string) => (useColor ? `\x1b[35m${s}\x1b[0m` : s),
};
const ok = (s: string) => console.log(c.green("✔ ") + s);
const warn = (s: string) => console.log(c.amber("! ") + s);
const fail = (s: string) => console.log(c.red("✖ ") + s);
const on = (b: boolean) => (b ? c.green("●") : c.dim("○"));
const pad = (s: string | number, n: number) => String(s).padEnd(n).slice(0, n);
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

function table(rows: string[][], widths: number[]) {
  for (const r of rows) console.log("  " + r.map((cell, i) => pad(cell, widths[i])).join("  "));
}

/* ------------------------------ helpers -------------------------------- */

function findLead(data: AppData, q: string): Lead | undefined {
  const s = q.trim().toLowerCase();
  return (
    data.leads.find((l) => l.id === q) ??
    data.leads.find((l) => l.id.toLowerCase().startsWith(s)) ??
    data.leads.find((l) => l.name.toLowerCase().includes(s) || l.email.toLowerCase() === s || l.phone.replace(/\D/g, "") === s.replace(/\D/g, ""))
  );
}

function findById<T extends { id: string }>(rows: T[], q: string): T | undefined {
  return rows.find((r) => r.id === q) ?? rows.find((r) => r.id.toLowerCase().startsWith(q.toLowerCase()));
}

function findEmployee(data: AppData, q: string) {
  const s = q.toLowerCase();
  return data.employees.find((e) => e.id === q || e.login.toLowerCase() === s || e.name.toLowerCase().includes(s));
}

const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "estimate", "won", "lost"];
const JOB_STATUSES: JobStatus[] = ["scheduled", "in_progress", "on_hold", "completed", "invoiced"];

/* ------------------------------- commands ------------------------------ */

type Handler = (args: string[], raw: string) => Promise<void>;
type Command = { name: string; usage: string; help: string; run: Handler; aliases?: string[] };

const commands: Command[] = [];
function cmd(def: Command) {
  commands.push(def);
}

cmd({
  name: "help",
  aliases: ["?"],
  usage: "help [command]",
  help: "List commands, or details for one",
  run: async ([name]) => {
    if (name) {
      const cmdDef = commands.find((x) => x.name === name || x.aliases?.includes(name));
      if (!cmdDef) return fail(`No command "${name}"`);
      console.log(`${c.bold(cmdDef.usage)}\n  ${cmdDef.help}`);
      return;
    }
    console.log(c.bold("\nBHC Console — commands"));
    const groups: Array<[string, string[]]> = [
      ["Overview", ["status", "health", "env", "digest"]],
      ["Sales", ["leads", "lead", "jobs", "job", "quote", "invoices", "invoice", "pay", "docs", "tickets", "team"]],
      ["Conversations", ["inbox", "ads", "ad", "outreach", "optouts"]],
      ["Automation", ["auto", "hooks", "backup", "backups", "restore", "reseed"]],
      ["AI", ["ai"]],
      ["Console", ["help", "clear", "exit"]],
    ];
    for (const [title, names] of groups) {
      console.log(`\n${c.cyan(title)}`);
      for (const n of names) {
        const d = commands.find((x) => x.name === n);
        if (d) console.log(`  ${pad(d.usage, 46)} ${c.dim(d.help)}`);
      }
    }
    console.log(`\n${c.dim("Anything else you type is sent to Mainframe AI, e.g. “create a lead for Sarah Wong, 902-555-0101, deck in Bedford”.")}\n`);
  },
});

cmd({
  name: "status",
  aliases: ["s", "dashboard"],
  usage: "status",
  help: "One-screen picture of the business + automation",
  run: async () => {
    const d = await readStore();
    const open = d.leads.filter((l) => !["won", "lost"].includes(l.status));
    const active = d.jobs.filter((j) => j.status === "in_progress" || j.status === "scheduled");
    const unpaid = d.invoices.filter((i) => i.kind === "invoice" && i.status === "sent");
    const pipeline = d.deals.filter((x) => !x.stage.startsWith("closed")).reduce((s, x) => s + x.amount, 0);
    const pendingOut = d.outreachQueue.filter((o) => o.status === "pending_approval");
    const st = automationStatus(d);
    console.log(c.bold(`\n${companyProfile().name} — ${new Date().toLocaleString()}`));
    table(
      [
        ["Open leads", String(open.length), "New today", String(d.leads.filter((l) => new Date(l.createdAt).toDateString() === new Date().toDateString()).length)],
        ["Active jobs", String(active.length), "Pipeline", money(pipeline)],
        ["Unpaid invoices", String(unpaid.length), "Unpaid $", money(unpaid.reduce((s, i) => s + i.lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0), 0))],
        ["Open tickets", String(d.tickets.filter((t) => t.status !== "closed").length), "Unread alerts", String(d.notifications.filter((n) => !n.readAt).length)],
        ["Job ads new", String(d.adListings.filter((a) => a.status === "new").length), "Replies to approve", String(pendingOut.length)],
        ["Automations armed", `${st.automations.filter((a) => a.enabled).length}/${st.automations.length}`, "Last tick", st.lastTick ? `${when(st.lastTick.finishedAt)} (${st.lastTick.source})` : "never"],
        ["Webhook backlog", String(st.webhookBacklog), "Store", `${storeHealth(d).approxMB} MB`],
      ],
      [18, 10, 20, 24],
    );
    if (st.recentErrors.length) {
      console.log("");
      for (const e of st.recentErrors.slice(0, 3)) warn(e);
    }
    console.log("");
  },
});

cmd({
  name: "env",
  aliases: ["setup", "keys"],
  usage: "env",
  help: "Which API keys / endpoints are configured and what is still missing",
  run: async () => {
    const ai = getAIStatus();
    const mail = mailConfigStatus();
    const sms = smsConfigStatus();
    const imap = imapSummary();
    const p = sendPolicy();
    const prof = companyProfile();
    const row = (okv: boolean, label: string, detail: string, fix: string) => console.log(`  ${on(okv)} ${pad(label, 18)} ${okv ? detail : c.amber(fix)}`);
    console.log(c.bold("\nConnections"));
    row(ai.configured, "AI (Claude)", `${ai.provider} · ${ai.model}`, "set ANTHROPIC_API_KEY (console.anthropic.com) — triage + drafting fall back to rules until then");
    row(mail.configured, "Email out", `${mail.provider} · from ${mail.from}`, "set SMTP_HOST/SMTP_USER/SMTP_PASS (GoDaddy) or RESEND_API_KEY");
    row(sms.configured, "SMS out", `twilio · ${sms.from}`, "set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER (or TWILIO_MESSAGING_SERVICE_SID)");
    row(imap.configured, "Alert mailbox", `${imap.user} · ${imap.host} · ${imap.folder}`, "set ADS_IMAP_HOST/USER/PASS — mailbox that receives Kijiji alerts + prospect replies");
    row(Boolean(process.env.ADS_INBOUND_SECRET), "Ads webhook in", "POST /api/ads/inbound", "set ADS_INBOUND_SECRET to accept ads from Zapier/Cloudflare");
    row(Boolean(process.env.TWILIO_AUTH_TOKEN), "SMS webhook in", "POST /api/sms/inbound (point Twilio here)", "needs TWILIO_AUTH_TOKEN");
    row(Boolean(process.env.AUTOMATION_SECRET), "Automation API", "POST /api/automation with x-bhc-automation-secret", "set AUTOMATION_SECRET for cron/GitHub Actions ticks");
    console.log(c.bold("\nOutreach policy"));
    console.log(`  auto-send: ${p.autosend.size ? [...p.autosend].join(" + ") + ` when score ≥ ${p.autosendMinScore}` : "off — you approve every reply (OUTREACH_AUTOSEND=email,sms to change)"}`);
    console.log(`  daily cap ${p.dailyCap} · SMS quiet hours ${p.quietStart}–${p.quietEnd} · follow-up after ${p.followUpDays} day(s), max ${p.maxFollowUps}`);
    console.log(`  signature: ${prof.signer} · ${prof.name} · ${prof.phone || c.amber("(set OUTREACH_REPLY_PHONE)")} · ${prof.email}`);
    console.log(c.dim("\n  Full checklist + what to buy: docs/OUTREACH.md\n"));
  },
});

cmd({
  name: "health",
  usage: "health",
  help: "Store integrity report",
  run: async () => {
    const d = await readStore();
    const h = storeHealth(d);
    console.log(`${h.ok ? c.green("OK") : c.red("ERRORS")} · ${h.approxMB} MB · ${h.photoDataUrls} inline photos`);
    for (const i of h.issues) (i.level === "error" ? fail : warn)(i.message);
    if (!h.issues.length) ok("no integrity issues");
  },
});

cmd({
  name: "digest",
  usage: "digest",
  help: "Today's ops digest (same text the daily automation posts)",
  run: async () => {
    const d = await readStore();
    const { buildDigestSnapshot, formatDigest } = await import("../src/lib/automation-checks");
    console.log(formatDigest(buildDigestSnapshot(d)));
  },
});

/* -------------------------------- sales -------------------------------- */

cmd({
  name: "leads",
  usage: "leads [status|search]",
  help: "List leads (newest first), filter by status or text",
  run: async ([q]) => {
    const d = await readStore();
    let rows = [...d.leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (q) rows = LEAD_STATUSES.includes(q as LeadStatus) ? rows.filter((l) => l.status === q) : rows.filter((l) => `${l.name} ${l.city} ${l.source} ${l.notes}`.toLowerCase().includes(q.toLowerCase()));
    if (!rows.length) return warn("no leads match");
    table([["id", "name", "status", "type", "city", "source", "score", "owner"]].concat(rows.slice(0, 40).map((l) => [l.id.slice(0, 8), l.name, l.status, l.jobType, l.city, l.source, String(l.leadScore), d.employees.find((e) => e.id === l.assignedToId)?.name ?? "—"])), [8, 26, 10, 11, 14, 18, 5, 16]);
    if (rows.length > 40) console.log(c.dim(`  … ${rows.length - 40} more`));
  },
});

cmd({
  name: "lead",
  usage: "lead <id|name> | lead new | lead status <id> <status> | lead assign <id> <employee> | lead note <id> <text>",
  help: "Show, create, or update a lead (fires workflows + webhooks like the web app)",
  run: async (args, raw) => {
    const [sub, ...rest] = args;
    if (sub === "new") return createLeadInteractive();
    if (sub === "status") {
      const [q, status] = rest;
      if (!LEAD_STATUSES.includes(status as LeadStatus)) return fail(`status must be one of ${LEAD_STATUSES.join(", ")}`);
      let name = "";
      await updateStore((d) => {
        const l = findLead(d, q);
        if (!l) return;
        l.status = status as LeadStatus;
        l.updatedAt = nowIso();
        name = l.name;
        const runs = onLeadStatusChanged(d, l, "emp-admin");
        queueWebhook(d, "lead.status_changed", { leadId: l.id, name: l.name, to: status }, newId, nowIso);
        if (runs.length) console.log(c.dim(`  ${runs.length} workflow(s) ran: ${runs.map((r) => `${d.workflows.find((w) => w.id === r.workflowId)?.name} (${r.status})`).join(", ")}`));
      });
      return name ? ok(`${name} → ${status}`) : fail("lead not found");
    }
    if (sub === "assign") {
      const [q, who] = rest;
      let msg = "";
      await updateStore((d) => {
        const l = findLead(d, q);
        const e = findEmployee(d, who);
        if (!l || !e) return;
        l.assignedToId = e.id;
        l.updatedAt = nowIso();
        msg = `${l.name} → ${e.name}`;
      });
      return msg ? ok(msg) : fail("lead or employee not found");
    }
    if (sub === "note") {
      const [q, ...note] = rest;
      let done = false;
      await updateStore((d) => {
        const l = findLead(d, q);
        if (!l) return;
        d.activities.unshift({ id: newId(), type: "note", subject: note.join(" ").slice(0, 80), body: note.join(" "), relatedType: "lead", relatedId: l.id, authorId: "emp-admin", dueAt: null, completedAt: nowIso(), createdAt: nowIso() });
        done = true;
      });
      return done ? ok("note added") : fail("lead not found");
    }
    const d = await readStore();
    const l = findLead(d, raw.replace(/^lead\s+/, ""));
    if (!l) return fail("lead not found");
    console.log(c.bold(`\n${l.name}`) + c.dim(`  ${l.id}`));
    console.log(`  ${l.status} · ${l.jobType} · score ${l.leadScore} · source ${l.source}`);
    console.log(`  ${[l.phone, l.email].filter(Boolean).join(" · ") || "no contact"} · ${l.address}, ${l.city}`);
    console.log(`  owner ${d.employees.find((e) => e.id === l.assignedToId)?.name ?? "unassigned"} · created ${when(l.createdAt)}`);
    if (l.notes) console.log(c.dim(`  ${l.notes.split("\n")[0].slice(0, 200)}`));
    const acts = d.activities.filter((a) => a.relatedId === l.id).slice(0, 8);
    if (acts.length) {
      console.log(c.cyan("  Timeline"));
      for (const a of acts) console.log(`   ${pad(when(a.createdAt), 14)} ${pad(a.type, 6)} ${a.subject}${a.type === "task" && !a.completedAt ? c.amber(" (open)") : ""}`);
    }
    const jobs = d.jobs.filter((j) => j.leadId === l.id);
    for (const j of jobs) console.log(`  job: ${j.title} · ${j.status} · ${money(j.contractValue)}`);
    const ads = d.adListings.filter((a) => a.leadId === l.id);
    for (const a of ads) console.log(`  ad: ${a.title} · ${a.status} · ${a.url}`);
    console.log("");
  },
});

async function createLeadInteractive() {
  const name = await ask("Name: ");
  if (!name) return fail("cancelled");
  const phone = await ask("Phone: ");
  const email = await ask("Email: ");
  const address = (await ask("Address: ")) || "TBD";
  const city = (await ask("City [Halifax]: ")) || "Halifax";
  const jobType = ((await ask("Type residential/commercial [residential]: ")) || "residential") as Lead["jobType"];
  const source = (await ask("Source [Console]: ")) || "Console";
  const notes = await ask("Notes: ");
  const stamp = nowIso();
  const lead: Lead = { id: newId(), name, phone, email, address, city, source, status: "new", jobType: jobType === "commercial" ? "commercial" : "residential", notes, assignedToId: null, companyId: null, leadScore: 50, createdAt: stamp, updatedAt: stamp };
  await updateStore((d) => {
    d.leads.unshift(lead);
    const runs = onLeadCreated(d, lead, "emp-admin");
    queueWebhook(d, "lead.created", { leadId: lead.id, name: lead.name, source }, newId, nowIso);
    if (runs.length) console.log(c.dim(`  ${runs.length} workflow(s) ran`));
  });
  ok(`lead created ${lead.id.slice(0, 8)} — ${lead.name}`);
}

cmd({
  name: "jobs",
  usage: "jobs [status]",
  help: "List jobs",
  run: async ([q]) => {
    const d = await readStore();
    const rows = d.jobs.filter((j) => !q || j.status === q);
    if (!rows.length) return warn("no jobs");
    table([["id", "title", "customer", "status", "start", "value", "crew lead"]].concat(rows.map((j) => [j.id.slice(0, 8), j.title, j.customerName, j.status, j.startDate, money(j.contractValue), d.employees.find((e) => e.id === j.crewLeadId)?.name ?? "—"])), [8, 30, 20, 12, 10, 10, 16]);
  },
});

cmd({
  name: "job",
  usage: "job <id> | job status <id> <status>",
  help: "Show a job or change its status (job completed → invoice workflow etc.)",
  run: async ([sub, ...rest], raw) => {
    if (sub === "status") {
      const [q, status] = rest;
      if (!JOB_STATUSES.includes(status as JobStatus)) return fail(`status must be one of ${JOB_STATUSES.join(", ")}`);
      let title = "";
      await updateStore((d) => {
        const j = findById(d.jobs, q);
        if (!j) return;
        j.status = status as JobStatus;
        title = j.title;
        const runs = onJobStatusChanged(d, j, "emp-admin");
        queueWebhook(d, "job.status_changed", { jobId: j.id, title: j.title, to: status }, newId, nowIso);
        if (runs.length) console.log(c.dim(`  ${runs.length} workflow(s) ran`));
      });
      return title ? ok(`${title} → ${status}`) : fail("job not found");
    }
    const d = await readStore();
    const j = findById(d.jobs, raw.replace(/^job\s+/, "")) ?? d.jobs.find((x) => x.title.toLowerCase().includes(raw.replace(/^job\s+/, "").toLowerCase()));
    if (!j) return fail("job not found");
    console.log(c.bold(`\n${j.title}`) + c.dim(`  ${j.id}`));
    console.log(`  ${j.status} · ${j.jobType} · ${j.customerName} · ${j.address}`);
    console.log(`  start ${j.startDate} · est ${money(j.estimatedValue)} · contract ${money(j.contractValue)} · crew ${d.employees.find((e) => e.id === j.crewLeadId)?.name ?? "—"}`);
    const prog = d.jobProgress.filter((p) => p.jobId === j.id);
    console.log(`  ${prog.length} site update(s) · ${d.invoices.filter((i) => i.jobId === j.id).length} invoice(s) · ${d.materials.filter((m) => m.jobId === j.id).length} material line(s)`);
    for (const p of prog.slice(0, 3)) console.log(c.dim(`   ${when(p.createdAt)} ${p.notes.slice(0, 100)}`));
    console.log("");
  },
});

cmd({
  name: "invoices",
  usage: "invoices [status]",
  help: "List invoices / job reports",
  run: async ([q]) => {
    const d = await readStore();
    const rows = d.invoices.filter((i) => !q || i.status === q);
    if (!rows.length) return warn("no invoices");
    table([["id", "kind", "status", "customer", "total", "created"]].concat(rows.map((i) => [i.id.slice(0, 8), i.kind, i.status, i.customerName, money(i.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)), when(i.createdAt)])), [8, 12, 8, 24, 10, 16]);
  },
});

cmd({
  name: "invoice",
  usage: "invoice status <id> <draft|sent|paid|void>",
  help: "Change invoice status (fires invoice workflows + webhooks)",
  run: async ([sub, q, status]) => {
    if (sub !== "status") return fail("usage: invoice status <id> <status>");
    let done = false;
    await updateStore((d) => {
      const inv = findById(d.invoices, q);
      if (!inv || !["draft", "sent", "paid", "void"].includes(status)) return;
      inv.status = status as typeof inv.status;
      done = true;
      queueWebhook(d, "invoice.status_changed", { invoiceId: inv.id, jobId: inv.jobId, to: status }, newId, nowIso);
    });
    return done ? ok(`invoice → ${status}`) : fail("invoice not found / bad status");
  },
});

cmd({
  name: "tickets",
  usage: "tickets",
  help: "Open support tickets",
  run: async () => {
    const d = await readStore();
    const rows = d.tickets.filter((t) => t.status !== "closed");
    if (!rows.length) return ok("no open tickets");
    table([["id", "priority", "status", "subject", "contact"]].concat(rows.map((t) => [t.id.slice(0, 8), t.priority, t.status, t.subject, t.contactName])), [8, 8, 8, 40, 20]);
  },
});

cmd({
  name: "team",
  usage: "team",
  help: "Staff accounts and roles",
  run: async () => {
    const d = await readStore();
    table([["login", "name", "role", "active", "password"]].concat(d.employees.map((e) => [e.login, e.name, ROLE_LABELS[e.role], e.active ? "yes" : "no", e.passwordHash ? "set" : c.amber("bootstrap PIN")])), [12, 22, 12, 6, 14]);
  },
});

/* --------------------------- job ads & outreach -------------------------- */

const adHooks = () => ({ newId, nowIso, pollImap: imapConfigured() ? pollImapInbox : undefined });

cmd({
  name: "ads",
  usage: "ads [all|new|drafted|sent|replied|skipped] | ads ingest | ads add | ads sources | ads source add <rss|imap|webhook|manual> <name> [url]",
  help: "Job-ad inbox, polling, and sources",
  run: async ([sub, ...rest]) => {
    if (sub === "ingest") {
      let summary = "";
      let errors: string[] = [];
      await updateStoreAsync(async (d) => {
        const r = await runAdIngest(d, adHooks());
        summary = r.summary;
        errors = r.errors;
      });
      ok(summary);
      for (const e of errors) warn(e);
      return;
    }
    if (sub === "add") {
      const title = await ask("Ad title: ");
      if (!title) return fail("cancelled");
      const body = await ask("Ad text (one line, optional): ");
      const url = await ask("URL: ");
      const location = await ask("Location: ");
      const contactName = await ask("Poster name: ");
      const contactEmail = await ask("Poster email: ");
      const contactPhone = await ask("Poster phone: ");
      await updateStoreAsync(async (d) => {
        const src = ensureBuiltinSource(d, "manual", { newId, nowIso });
        const [ad] = ingestRawAds(d, src, [{ title, body, url, location, contactName, contactEmail, contactPhone, postedAt: nowIso() }], { newId, nowIso });
        if (!ad) return fail("duplicate ad");
        const r = await qualifyListing(d, ad, adHooks());
        console.log(`  ${r.qualified ? c.green("QUALIFIED") : c.amber("SKIPPED")} score ${ad.score} · ${ad.category} · ${ad.summary}`);
        for (const dr of r.drafts) console.log(`  draft ${dr.channel} (${dr.status}) → use: ad ${ad.id.slice(0, 8)}`);
      });
      return;
    }
    if (sub === "sources") {
      const d = await readStore();
      if (!d.adSources.length) return warn("no sources — try: ads source add imap \"Kijiji alerts\"  (after setting ADS_IMAP_*)");
      for (const s of d.adSources) console.log(`  ${on(s.enabled)} ${pad(s.id.slice(0, 8), 8)} ${pad(s.type, 7)} ${pad(s.name, 28)} ${s.url} ${c.dim(`last ${when(s.lastPolledAt)}`)}${s.lastError ? c.red(` ! ${s.lastError}`) : ""}`);
      return;
    }
    if (sub === "source") {
      const [verb, type, name, url] = rest;
      if (verb === "add") {
        if (!type || !name || !["rss", "imap", "webhook", "manual"].includes(type)) return fail("usage: ads source add <rss|imap|webhook|manual> <name> [url]");
        const keywords = (await ask("Keep only ads containing (comma list, blank = all): ")).split(",").map((s) => s.trim()).filter(Boolean);
        const exclude = (await ask("Drop ads containing [for sale, we offer, free estimates]: ") || "for sale, we offer, free estimates").split(",").map((s) => s.trim()).filter(Boolean);
        const src = newAdSource({ name, type: type as "rss", url: url ?? "", keywords, excludeKeywords: exclude }, { newId, nowIso });
        await updateStore((d) => {
          d.adSources.push(src);
        });
        return ok(`source added ${src.id.slice(0, 8)} — run "ads ingest" to poll now`);
      }
      if (verb === "rm" || verb === "remove") {
        await updateStore((d) => {
          d.adSources = d.adSources.filter((s) => !s.id.startsWith(type));
        });
        return ok("removed");
      }
      if (verb === "toggle") {
        await updateStore((d) => {
          const s = d.adSources.find((x) => x.id.startsWith(type));
          if (s) s.enabled = !s.enabled;
        });
        return ok("toggled");
      }
      return fail("usage: ads source add|rm|toggle …");
    }
    const d = await readStore();
    const filter = sub ?? "attention";
    const rows = d.adListings.filter((a) => (filter === "all" ? true : filter === "attention" ? ["new", "qualified", "drafted"].includes(a.status) : filter === "drafted" ? a.status === "drafted" || a.status === "qualified" : a.status === filter));
    if (!rows.length) return ok(filter === "attention" ? "nothing needs attention" : `no ads (${filter})`);
    table([["id", "score", "status", "category", "title", "source", "drafts"]].concat(rows.slice(0, 40).map((a) => [a.id.slice(0, 8), a.status === "new" ? "…" : String(a.score), a.status, a.category, a.title, a.sourceName, d.outreachQueue.filter((o) => o.adId === a.id).map((o) => `${o.channel}:${o.status}`).join(",")])), [8, 5, 9, 18, 44, 12, 30]);
  },
});

cmd({
  name: "ad",
  usage: "ad <id> | ad approve <id> [email|sms] | ad send <id> [email|sms] | ad skip <id> | ad replied <id> | ad won <id> | ad lost <id> | ad redraft <id> | ad edit <outreachId>",
  help: "Work one ad: view drafts, approve/send them, mark outcomes, edit the message",
  run: async ([sub, q, channel]) => {
    if (!sub) return fail("usage: ad <id>");
    const verbs = ["approve", "send", "skip", "replied", "won", "lost", "redraft", "edit", "restore"];
    if (!verbs.includes(sub)) {
      const d = await readStore();
      const a = findById(d.adListings, sub);
      if (!a) return fail("ad not found");
      console.log(c.bold(`\n${a.title}`) + c.dim(`  ${a.id}`));
      console.log(`  ${a.status} · score ${a.score} · ${a.category}${a.jobType ? ` · ${a.jobType}` : ""} · ${a.sourceName} · ${a.location || "location ?"} · triaged by ${a.classifiedBy ?? "—"}`);
      if (a.url) console.log(`  ${a.url}`);
      console.log(`  contact: ${[a.contactName, a.contactEmail, a.contactPhone].filter(Boolean).join(" · ") || c.amber("none — reply on the platform")}`);
      if (a.summary) console.log(`  ${a.summary}`);
      if (a.reasons.length) console.log(c.dim(`  ${a.reasons.join(" · ")}`));
      console.log(c.dim(`\n  ${a.body.slice(0, 500).replace(/\n+/g, "\n  ")}`));
      const drafts = d.outreachQueue.filter((o) => o.adId === a.id);
      for (const o of drafts) {
        console.log(`\n  ${c.magenta(`[${o.channel}] ${o.status}`)} ${c.dim(o.id.slice(0, 8))} → ${o.channel === "sms" ? o.prospectPhone : o.channel === "email" ? o.prospectEmail : "paste on platform"}${o.sentAt ? ` · sent ${when(o.sentAt)} via ${o.provider}` : ""}${o.error ? c.red(` · ${o.error}`) : ""}`);
        if (o.channel !== "sms") console.log(`  Subject: ${o.subject}`);
        console.log("  " + o.message.replace(/\n/g, "\n  "));
      }
      console.log("");
      return;
    }
    const d0 = await readStore();
    const ad = findById(d0.adListings, q ?? "");
    if (!ad) return fail("ad not found");
    if (sub === "skip" || sub === "won" || sub === "lost" || sub === "restore") {
      await updateStore((d) => {
        const a = d.adListings.find((x) => x.id === ad.id)!;
        a.status = sub === "restore" ? "new" : sub === "skip" ? "skipped" : sub;
        if (sub === "won" && a.leadId) {
          const l = d.leads.find((x) => x.id === a.leadId);
          if (l) l.status = "won";
        }
        if (sub === "skip" || sub === "lost") for (const o of d.outreachQueue) if (o.adId === a.id && ["pending_approval", "approved"].includes(o.status)) o.status = "cancelled";
      });
      return ok(`ad → ${sub === "restore" ? "new" : sub}`);
    }
    if (sub === "replied") {
      await updateStore((d) => {
        markAdReplied(d, ad.id, { newId, nowIso });
      });
      return ok("marked replied — follow-ups stopped, lead → contacted");
    }
    if (sub === "redraft") {
      await updateStoreAsync(async (d) => {
        const a = d.adListings.find((x) => x.id === ad.id)!;
        const drop = new Set(d.outreachQueue.filter((o) => o.adId === a.id && !o.followUpOf && ["pending_approval", "approved", "failed"].includes(o.status)).map((o) => o.id));
        d.outreachQueue = d.outreachQueue.filter((o) => !drop.has(o.id));
        a.outreachIds = a.outreachIds.filter((id) => !drop.has(id));
        const r = await qualifyListing(d, a, adHooks(), { force: true });
        ok(`${r.drafts.length} new draft(s)`);
      });
      return;
    }
    if (sub === "edit") {
      const item = findById(d0.outreachQueue, q ?? "");
      if (!item) return fail("outreach item not found (use the draft id shown under `ad <id>`)");
      console.log(c.dim("Enter the new message. Finish with a line containing only '.'  (blank to keep current)"));
      const lines: string[] = [];
      for (;;) {
        const line = await ask("");
        if (line === ".") break;
        lines.push(line);
      }
      const subject = item.channel !== "sms" ? (await ask(`Subject [${item.subject}]: `)) || item.subject : item.subject;
      await updateStore((d) => {
        const o = d.outreachQueue.find((x) => x.id === item.id)!;
        if (lines.length) o.message = lines.join("\n");
        o.subject = subject;
      });
      return ok("draft updated");
    }
    // approve / send
    const targets = d0.outreachQueue.filter((o) => o.adId === ad.id && !o.followUpOf && ["pending_approval", "approved", "failed"].includes(o.status) && (!channel || o.channel === channel));
    if (!targets.length) return fail("no unsent drafts for that ad/channel");
    if (sub === "approve") {
      await updateStore((d) => {
        for (const t of targets) {
          const o = d.outreachQueue.find((x) => x.id === t.id)!;
          o.status = "approved";
          o.error = null;
        }
      });
      return ok(`${targets.length} draft(s) approved — they go out on the next automation tick (or run: outreach send)`);
    }
    if (sub === "send") {
      const senders = serverSenders();
      let summary = "";
      await updateStoreAsync(async (d) => {
        const ids = new Set(targets.map((t) => t.id));
        const others = d.outreachQueue.filter((o) => !ids.has(o.id) && o.status === "approved");
        for (const o of others) o.status = "queued";
        for (const o of d.outreachQueue) if (ids.has(o.id)) o.status = o.channel === "platform" ? "sent" : "approved";
        const r = await processOutreachQueue(d, { newId, nowIso }, senders, { ...sendPolicy(), quietStart: 0, quietEnd: 0 });
        for (const o of others) o.status = "approved";
        summary = r.summary;
        for (const o of d.outreachQueue) if (ids.has(o.id) && o.status === "failed") warn(`${o.channel}: ${o.error}`);
        if (!senders.email && !senders.sms) warn("no sender configured (SMTP_*/RESEND_API_KEY, TWILIO_*) — drafts stay approved");
      });
      return ok(summary);
    }
  },
});

cmd({
  name: "outreach",
  usage: "outreach [status|<filter>] | outreach approve <id|all> | outreach send | outreach cancel <id>",
  help: "Whole outreach queue (ad replies + prospect hunt drafts)",
  run: async ([sub, q]) => {
    if (sub === "status" || sub === "summary") {
      const d = await readStore();
      const by = (s: string) => d.outreachQueue.filter((o) => o.status === s).length;
      const today = new Date().toDateString();
      console.log(`  ${by("pending_approval")} awaiting approval · ${by("approved")} approved (send on next tick) · ${by("sent")} sent (${d.outreachQueue.filter((o) => o.sentAt && new Date(o.sentAt).toDateString() === today).length} today) · ${by("failed")} failed · ${by("cancelled")} cancelled · ${d.optOuts.length} opt-out(s)`);
      const p = sendPolicy();
      console.log(c.dim(`  auto-send ${p.autosend.size ? [...p.autosend].join("+") : "off"} · cap ${p.dailyCap}/day · quiet ${p.quietStart}-${p.quietEnd}h`));
      return;
    }
    if (sub === "approve") {
      let n = 0;
      await updateStore((d) => {
        for (const o of d.outreachQueue) {
          if (o.status !== "pending_approval") continue;
          if (q === "all" || o.id.startsWith(q ?? "")) {
            o.status = "approved";
            n += 1;
          }
        }
      });
      return ok(`${n} approved`);
    }
    if (sub === "cancel") {
      await updateStore((d) => {
        const o = findById(d.outreachQueue, q ?? "");
        if (o) o.status = "cancelled";
      });
      return ok("cancelled");
    }
    if (sub === "send") {
      const senders = serverSenders();
      if (!senders.email && !senders.sms) return fail("no sender configured — set SMTP_*/RESEND_API_KEY and/or TWILIO_*");
      let summary = "";
      await updateStoreAsync(async (d) => {
        summary = (await processOutreachQueue(d, { newId, nowIso }, senders)).summary;
      });
      return ok(summary);
    }
    const d = await readStore();
    const rows = d.outreachQueue.filter((o) => (sub ? o.status === sub : o.status === "pending_approval" || o.status === "approved" || o.status === "failed"));
    if (!rows.length) return ok(sub ? `no outreach with status ${sub}` : "queue is clear");
    table([["id", "channel", "status", "to", "subject / preview", "ad"]].concat(rows.slice(0, 40).map((o) => [o.id.slice(0, 8), o.channel, o.status, o.channel === "sms" ? o.prospectPhone : o.prospectEmail || "(platform)", (o.channel === "sms" ? o.message : o.subject).slice(0, 48), o.adId ? o.adId.slice(0, 8) : "—"])), [8, 8, 16, 26, 48, 8]);
  },
});

cmd({
  name: "optouts",
  usage: "optouts | optouts add <sms|email> <address> [reason]",
  help: "Do-not-contact list (STOP replies land here automatically)",
  run: async ([sub, channel, address, ...reason]) => {
    if (sub === "add") {
      if (channel !== "sms" && channel !== "email") return fail("channel must be sms or email");
      await updateStore((d) => {
        recordOptOut(d, { channel, address, reason: reason.join(" ") || "manual", source: "manual" }, { newId, nowIso });
      });
      return ok(`${address} will never be contacted by ${channel}`);
    }
    const d = await readStore();
    if (!d.optOuts.length) return ok("no opt-outs");
    table([["channel", "address", "reason", "source", "when"]].concat(d.optOuts.map((o) => [o.channel, o.address, o.reason, o.source, when(o.createdAt)])), [7, 30, 30, 14, 16]);
  },
});

/* ------------------------------ automation ------------------------------ */

cmd({
  name: "auto",
  aliases: ["automations", "automation"],
  usage: "auto | auto tick [--force] | auto run <id> | auto on <id> | auto off <id> | auto log",
  help: "Automation engine: status, run a tick, toggle automations, recent tick log",
  run: async ([sub, arg, flag]) => {
    if (sub === "tick") {
      const r = await runServerTick({ source: "cli", force: arg === "--force" || flag === "--force" });
      for (const line of r.results) console.log("  • " + line);
      for (const e of r.errors) fail(e);
      const k = r.counters;
      return ok(`${k.automationsRun} automation(s) · ${k.notificationsCreated} alert(s) · ${k.tasksCreated} task(s) · webhooks ${k.webhooksSent}/${k.webhooksFailed}${k.backupCreated ? " · backup" : ""} · ${r.durationMs}ms`);
    }
    if (sub === "run") {
      const d = await readStore();
      const a = d.assistantAutomations.find((x) => x.id === arg || x.id.includes(arg ?? "") || x.action === arg);
      if (!a) return fail("automation not found");
      const r = await runServerTick({ source: "cli", force: true, only: [a.id] });
      for (const line of r.results) console.log("  • " + line);
      for (const e of r.errors) fail(e);
      return;
    }
    if (sub === "on" || sub === "off") {
      let name = "";
      await updateStore((d) => {
        const a = d.assistantAutomations.find((x) => x.id === arg || x.id.includes(arg ?? "") || x.action === arg);
        if (!a) return;
        a.enabled = sub === "on";
        name = a.name;
      });
      return name ? ok(`${name} ${sub}`) : fail("automation not found");
    }
    if (sub === "log") {
      const d = await readStore();
      for (const t of d.automationRuns.slice(0, 10)) {
        console.log(`${c.bold(when(t.finishedAt))} ${t.source} · ${t.durationMs}ms · ${t.results.length} result(s)${t.errors.length ? c.red(` · ${t.errors.length} error(s)`) : ""}`);
        for (const r of t.results.slice(0, 6)) console.log(c.dim(`   ${r.slice(0, 140)}`));
        for (const e of t.errors) console.log(c.red(`   ! ${e}`));
      }
      return;
    }
    const d = await readStore();
    const st = automationStatus(d);
    console.log(st.lastTick ? `Last tick ${when(st.lastTick.finishedAt)} via ${st.lastTick.source} · ${st.lastTick.results.length} result(s), ${st.lastTick.errors.length} error(s) · backlog ${st.webhookBacklog} webhook(s)` : c.amber("no tick yet — run: auto tick"));
    for (const a of d.assistantAutomations) {
      console.log(`  ${on(a.enabled)} ${pad(a.id, 24)} ${pad(st.automations.find((x) => x.id === a.id)?.schedule ?? "", 16)} ${isAutomationDue(a) ? c.amber("[due] ") : "      "}${c.dim(`last ${when(a.lastRunAt)}`)}  ${a.name}`);
    }
  },
});

cmd({
  name: "hooks",
  aliases: ["webhooks"],
  usage: "hooks | hooks presets | hooks add <preset|custom> <url> [name] | hooks test <id> | hooks on|off|rm <id> | hooks events | hooks backlog | hooks retry | hooks log",
  help: "Outbound webhooks (Slack/Discord/Zapier/Make). Presets pre-fill events + format.",
  run: async ([sub, a, b, ...rest]) => {
    if (sub === "presets") {
      for (const p of WEBHOOK_PRESETS) {
        console.log(`\n  ${c.bold(p.id)}  ${p.name} ${c.dim(`(${p.format})`)}\n    ${p.description}\n    ${c.dim(`events: ${p.events.join(", ")}`)}\n    ${c.dim(`url: ${p.urlHint}`)}`);
      }
      console.log(`\n  add one: ${c.cyan("hooks add ops-alerts-slack https://hooks.slack.com/services/…")}\n`);
      return;
    }
    if (sub === "events") return console.log("  " + ALL_WEBHOOK_EVENTS.join("\n  "));
    if (sub === "add") {
      if (!a || !b) return fail("usage: hooks add <preset|custom> <url> [name]");
      const preset = WEBHOOK_PRESETS.find((p) => p.id === a);
      let endpoint;
      if (preset) endpoint = endpointFromPreset(preset, b, newId, nowIso, rest.join(" ") || undefined);
      else if (a === "custom") {
        const events = (await ask(`Events (comma list) [lead.created,job.status_changed]: `) || "lead.created,job.status_changed").split(",").map((s) => s.trim()) as WebhookEventName[];
        const bad = events.filter((e) => !ALL_WEBHOOK_EVENTS.includes(e));
        if (bad.length) return fail(`unknown events: ${bad.join(", ")} — see: hooks events`);
        const format = /hooks\.slack\.com/.test(b) ? "slack" : /discord/.test(b) ? "discord" : "json";
        endpoint = { id: newId(), name: rest.join(" ") || new URL(b).hostname, url: b, secret: randomWebhookSecret(), events, enabled: true, createdAt: nowIso(), format: format as "json", preset: null };
      } else return fail(`unknown preset "${a}" — see: hooks presets`);
      await updateStore((d) => {
        d.webhookEndpoints.unshift(endpoint!);
      });
      ok(`webhook ${endpoint.id.slice(0, 8)} added (${endpoint.format}) — ${endpoint.events.length} event(s)`);
      console.log(`  signing secret (shown once): ${c.bold(endpoint.secret)}`);
      console.log(`  test it: hooks test ${endpoint.id.slice(0, 8)}`);
      return;
    }
    if (sub === "test") {
      let status = "";
      let err: string | null = null;
      await updateStoreAsync(async (d) => {
        const ep = d.webhookEndpoints.find((e) => e.id.startsWith(a ?? "x"));
        if (!ep) return;
        const event = ep.events[0] ?? "automation.ran";
        const clone = { ...d, webhookEndpoints: [{ ...ep, enabled: true, events: [event] }] } as AppData;
        const [q] = queueWebhook(clone, event, { test: true, endpoint: ep.name, note: "Test from BHC console" }, newId, nowIso);
        if (!q) return;
        d.webhookDeliveries.unshift(q);
        await deliverPendingWebhooks(d, nowIso, { onlyIds: [q.id] });
        const done = d.webhookDeliveries.find((x) => x.id === q.id)!;
        status = done.status;
        err = done.lastError;
      });
      if (!status) return fail("endpoint not found");
      return status === "ok" ? ok("delivered") : fail(`failed: ${err}`);
    }
    if (sub === "on" || sub === "off" || sub === "rm") {
      let name = "";
      await updateStore((d) => {
        const ep = d.webhookEndpoints.find((e) => e.id.startsWith(a ?? "x"));
        if (!ep) return;
        name = ep.name;
        if (sub === "rm") d.webhookEndpoints = d.webhookEndpoints.filter((e) => e.id !== ep.id);
        else ep.enabled = sub === "on";
      });
      return name ? ok(`${name} ${sub}`) : fail("endpoint not found");
    }
    if (sub === "backlog") {
      const d = await readStore();
      const rows = webhookBacklog(d);
      if (!rows.length) return ok("backlog empty");
      table([["id", "event", "attempt", "retry at", "error"]].concat(rows.map((x) => [x.id.slice(0, 8), x.event, String(x.attempts), when(x.nextRetryAt), x.lastError ?? "pending"])), [8, 24, 7, 16, 40]);
      return;
    }
    if (sub === "retry") {
      let r = { sent: 0, failed: 0, abandoned: 0 };
      await updateStoreAsync(async (d) => {
        for (const x of webhookBacklog(d)) x.nextRetryAt = nowIso();
        r = await deliverPendingWebhooks(d, nowIso);
      });
      return ok(`${r.sent} delivered, ${r.failed} will retry, ${r.abandoned} abandoned`);
    }
    if (sub === "log") {
      const d = await readStore();
      for (const x of d.webhookDeliveries.slice(0, 20)) console.log(`  ${pad(when(x.createdAt), 16)} ${pad(x.event, 24)} ${x.status === "ok" ? c.green(x.status) : c.red(x.status)} ${c.dim(d.webhookEndpoints.find((e) => e.id === x.endpointId)?.name ?? "?")}${x.lastError ? c.dim(` · ${x.lastError}`) : ""}`);
      return;
    }
    const d = await readStore();
    if (!d.webhookEndpoints.length) return warn("no webhooks yet — see: hooks presets");
    for (const e of d.webhookEndpoints) {
      const deliveries = d.webhookDeliveries.filter((x) => x.endpointId === e.id);
      console.log(`  ${on(e.enabled)} ${pad(e.id.slice(0, 8), 8)} ${pad(e.name, 28)} ${pad(e.format ?? "json", 7)} ${c.dim(e.url.slice(0, 50))}\n      ${c.dim(`${e.events.length} event(s) · ${deliveries.filter((x) => x.status === "ok").length} ok / ${deliveries.filter((x) => x.status === "failed").length} failed`)}`);
    }
  },
});

cmd({
  name: "inbox",
  aliases: ["messages"],
  usage: "inbox | inbox <thread-key> | inbox send <sms|email> <to> <text…> | inbox draft <thread-key>",
  help: "Two-way messages: threads, read a conversation, send, or have Claude draft the next reply",
  run: async ([sub, ...rest], raw) => {
    const { buildThreads, threadMessages, draftThreadReply, recordMessage, markThreadRead } = await import("../src/lib/messaging");
    if (sub === "send") {
      const [channel, to, ...words] = rest;
      const text = words.join(" ");
      if ((channel !== "sms" && channel !== "email") || !to || !text) return fail("usage: inbox send <sms|email> <to> <text…>");
      const senders = serverSenders();
      const sender = channel === "sms" ? senders.sms : senders.email;
      if (!sender) return fail(`no ${channel} sender configured`);
      let summary = "";
      await updateStoreAsync(async (d) => {
        const r = channel === "sms" ? await senders.sms!({ to, body: text }) : await senders.email!({ to, subject: "Message from BH Contracting", text });
        recordMessage(d, { channel, direction: "out", from: "", to, subject: channel === "email" ? "Message from BH Contracting" : "", body: text, leadId: null, jobId: null, adId: null, provider: r.provider ?? null, providerId: r.id ?? null, status: r.ok ? "sent" : "failed", recordingUrl: null, transcription: null, durationSec: null }, { newId, nowIso });
        summary = r.ok ? `sent via ${r.provider}` : `failed: ${r.error}`;
      });
      return ok(summary);
    }
    if (sub === "draft") {
      const key = rest[0];
      if (!key) return fail("usage: inbox draft <thread-key>");
      const d = await readStore();
      const r = await draftThreadReply(d, key, { instruction: rest.slice(1).join(" ") || undefined });
      console.log(c.magenta(`[${r.by}]`) + "\n" + r.text + "\n");
      return;
    }
    if (sub) {
      let msgs: Awaited<ReturnType<typeof threadMessages>> = [];
      await updateStore((d) => {
        msgs = threadMessages(d, sub);
        markThreadRead(d, sub, { newId, nowIso });
      });
      if (!msgs.length) return fail(`no thread "${sub}" — keys look like sms:+19025550142 or email:jane@example.com`);
      for (const m of msgs) console.log(`  ${pad(when(m.createdAt), 16)} ${m.direction === "out" ? c.cyan("BHC →") : c.green("← them")} ${m.channel}${m.subject ? ` · ${m.subject}` : ""}\n    ${(m.transcription ?? m.body).replace(/\n/g, "\n    ")}`);
      return;
    }
    void raw;
    const d = await readStore();
    const threads = buildThreads(d, 40);
    if (!threads.length) return ok("inbox empty");
    table([["thread key", "name", "unread", "last", "preview"]].concat(threads.map((t) => [t.key, t.name, t.unread ? String(t.unread) : "", when(t.lastAt), t.lastBody.slice(0, 50)])), [34, 22, 6, 16, 50]);
  },
});

cmd({
  name: "quote",
  aliases: ["quotes"],
  usage: "quote | quote <id> | quote new <job-id|lead-id> | quote send <id> | quote pdf <id>",
  help: "Quotes: list, view, create for a job/lead, send for e-signature, generate PDF",
  run: async ([sub, arg]) => {
    const { createQuote, quoteTotals, quotePublicUrl } = await import("../src/lib/quotes");
    const base = (process.env.APP_BASE_URL ?? "https://bhcontracting.ca").replace(/\/$/, "");
    if (sub === "new") {
      if (!arg) return fail("usage: quote new <job-id|lead-id>");
      let number = "";
      await updateStore((d) => {
        const job = findById(d.jobs, arg);
        const lead = job ? undefined : findLead(d, arg);
        if (!job && !lead) return;
        const q = createQuote(d, { jobId: job?.id ?? null, leadId: lead?.id ?? null, createdById: "emp-admin" }, { newId, nowIso });
        number = q.number;
      });
      return number ? ok(`${number} created — edit lines in /admin/jobs/<id> (Quote tab), then: quote send <id>`) : fail("job or lead not found");
    }
    if (sub === "send" || sub === "pdf") {
      if (!arg) return fail(`usage: quote ${sub} <id>`);
      const { generateDocument } = await import("../src/lib/documents");
      const { deliverDocument } = await import("../src/lib/deliver");
      let summary = "";
      await updateStoreAsync(async (d) => {
        const q = findById(d.quotes, arg) ?? d.quotes.find((x) => x.number === arg);
        if (!q) return;
        const doc = await generateDocument(d, { kind: "quote", quoteId: q.id }, { newId, nowIso, createdById: "emp-admin" });
        if (sub === "pdf") {
          summary = `PDF: ${doc.fileUrl}`;
          return;
        }
        const r = await deliverDocument(d, doc, { newId, nowIso });
        summary = r.email === "sent" || r.sms === "sent" ? `sent (${r.email}/${r.sms}) · ${quotePublicUrl(q, base)}` : `not sent: ${r.errors.join("; ")}`;
      });
      return summary ? ok(summary) : fail("quote not found");
    }
    const d = await readStore();
    if (sub) {
      const q = findById(d.quotes, sub) ?? d.quotes.find((x) => x.number === sub);
      if (!q) return fail("quote not found");
      const t = quoteTotals(q);
      console.log(c.bold(`\n${q.number} — ${q.title}`) + c.dim(`  ${q.id}`));
      console.log(`  ${q.status} · ${q.customerName} · ${q.address} · valid until ${when(q.validUntil)}`);
      for (const l of q.lines) console.log(`   ${pad(l.description, 44)} ${pad(`${l.quantity} ${l.unit}`, 10)} ${money(l.unitPrice).padStart(10)} ${money(l.quantity * l.unitPrice).padStart(11)}`);
      console.log(`  subtotal ${money(t.subtotal)} · HST ${money(t.tax)} · total ${money(t.total)} · deposit ${money(t.deposit)}`);
      console.log(`  customer link: ${quotePublicUrl(q, base)}${q.signedAt ? ` · signed by ${q.signerName} ${when(q.signedAt)}` : ""}\n`);
      return;
    }
    if (!d.quotes.length) return warn("no quotes yet — quote new <job-id|lead-id>");
    table([["id", "number", "status", "customer", "title", "total", "sent"]].concat(d.quotes.slice(0, 40).map((q) => [q.id.slice(0, 8), q.number, q.status, q.customerName, q.title, money(quoteTotals(q).total), when(q.sentAt)])), [8, 12, 9, 22, 30, 11, 16]);
  },
});

cmd({
  name: "docs",
  aliases: ["documents"],
  usage: "docs [job-id] | docs make <contract|invoice|receipt|job_report> <job-id|invoice-id> | docs send <doc-id>",
  help: "Generated PDFs (quotes, contracts, invoices, receipts, job reports) and sending them to the customer",
  run: async ([sub, a, b]) => {
    if (sub === "make") {
      const { generateDocument } = await import("../src/lib/documents");
      const { deliverDocument, autosendKinds } = await import("../src/lib/deliver");
      if (!a || !b) return fail("usage: docs make <contract|invoice|receipt|job_report> <job-id|invoice-id>");
      let summary = "";
      await updateStoreAsync(async (d) => {
        const kind = a as "contract" | "invoice" | "receipt" | "job_report";
        const input = kind === "invoice" || kind === "receipt" ? { kind, invoiceId: findById(d.invoices, b)?.id ?? b } : { kind, jobId: findById(d.jobs, b)?.id ?? b };
        const doc = await generateDocument(d, input as Parameters<typeof generateDocument>[1], { newId, nowIso, createdById: "emp-admin" });
        summary = `${doc.title} → ${doc.fileUrl}`;
        if (autosendKinds().has(kind)) {
          const r = await deliverDocument(d, doc, { newId, nowIso });
          summary += ` · ${r.email}/${r.sms}`;
        }
      });
      return ok(summary);
    }
    if (sub === "send") {
      const { deliverDocument } = await import("../src/lib/deliver");
      let summary = "";
      await updateStoreAsync(async (d) => {
        const doc = findById(d.documents, a ?? "");
        if (!doc) return;
        const r = await deliverDocument(d, doc, { newId, nowIso });
        summary = `${doc.title}: email ${r.email} · sms ${r.sms}${r.errors.length ? ` · ${r.errors.join("; ")}` : ""}`;
      });
      return summary ? ok(summary) : fail("document not found");
    }
    const d = await readStore();
    const rows = d.documents.filter((x) => !sub || x.jobId?.startsWith(sub)).slice(0, 40);
    if (!rows.length) return warn("no documents");
    table([["id", "kind", "number", "title", "sent"]].concat(rows.map((x) => [x.id.slice(0, 8), x.kind, x.number, x.title, x.sentAt ? `${when(x.sentAt)} ${x.sentVia}` : "—"])), [8, 11, 14, 46, 22]);
  },
});

cmd({
  name: "pay",
  aliases: ["payments"],
  usage: "pay | pay record <invoice-id> <amount> [etransfer|cash|cheque] [note] | pay link <invoice-id>",
  help: "Payments: open balances, record a manual payment, get the customer pay link",
  run: async ([sub, a, b, c2, ...rest]) => {
    const { applyPayment, invoiceBalance, ensureInvoiceToken, invoicePayUrl } = await import("../src/lib/payments");
    if (sub === "record") {
      const amount = Number(b);
      if (!a || !Number.isFinite(amount) || amount <= 0) return fail("usage: pay record <invoice-id> <amount> [method] [note]");
      let summary = "";
      await updateStore((d) => {
        const inv = findById(d.invoices, a) ?? d.invoices.find((i) => i.number === a);
        if (!inv) return;
        const r = applyPayment(d, { invoiceId: inv.id, amount, method: (c2 as "etransfer") || "etransfer", note: rest.join(" "), provider: "manual" }, { newId, nowIso });
        summary = `${money(r.payment.amount)} recorded on ${inv.number ?? inv.id.slice(0, 8)}${r.paidInFull ? " — PAID IN FULL" : ` — balance ${money(invoiceBalance(d, inv))}`}`;
      });
      return summary ? ok(summary) : fail("invoice not found");
    }
    if (sub === "link") {
      let url = "";
      await updateStore((d) => {
        const inv = findById(d.invoices, a ?? "") ?? d.invoices.find((i) => i.number === a);
        if (!inv) return;
        ensureInvoiceToken(inv, newId);
        url = invoicePayUrl(inv);
      });
      return url ? ok(url) : fail("invoice not found");
    }
    const d = await readStore();
    const open = d.invoices.filter((i) => i.kind === "invoice" && i.status === "sent");
    if (!open.length) return ok("no open invoices");
    table([["id", "number", "customer", "balance", "due", "reminders"]].concat(open.map((i) => [i.id.slice(0, 8), i.number ?? "", i.customerName, money(invoiceBalance(d, i)), when(i.dueAt), String(i.remindersSent ?? 0)])), [8, 14, 24, 11, 16, 9]);
  },
});

cmd({
  name: "backup",
  usage: "backup",
  help: "Snapshot data/store.json → data/backups/",
  run: async () => {
    const b = await createBackup({ label: "console" });
    return b ? ok(`${b.name} (${Math.round(b.bytes / 1024)} KB)`) : warn("no store yet");
  },
});
cmd({
  name: "backups",
  usage: "backups",
  help: "List snapshots",
  run: async () => {
    const list = await listBackups();
    if (!list.length) return warn("no snapshots");
    for (const b of list) console.log(`  ${when(b.createdAt)}  ${String(Math.round(b.bytes / 1024)).padStart(6)} KB  ${b.name}`);
  },
});
cmd({
  name: "reseed",
  usage: "reseed [--fresh-staff] [--drop-optouts]",
  help: "Wipe all CRM data to a clean seed. Staff accounts are kept and reset to PIN 0000 (backup taken first)",
  run: async (args) => {
    const keepStaff = !args.includes("--fresh-staff");
    const keepOptOuts = !args.includes("--drop-optouts");
    console.log(c.amber("This replaces ALL leads, jobs, invoices, ads, messages, documents, automations and webhooks with a clean seed."));
    console.log(keepStaff ? "Staff accounts are kept — each goes back to PIN 0000 and must set a password on next sign-in." : c.red("Staff accounts will be replaced by the default role accounts."));
    console.log(keepOptOuts ? "Opt-out list is kept." : c.red("Opt-out list will be dropped."));
    const yes = await ask(c.amber("Type RESEED to continue: "));
    if (yes !== "RESEED") return warn("cancelled");
    const { reseedStore } = await import("../src/lib/reseed");
    const current = await readStore();
    const b = await createBackup({ label: "pre-reseed" });
    const r = reseedStore(current, { keepStaff, keepOptOuts });
    await updateStore(() => r.data);
    ok(`reseeded · backup ${b?.name ?? "none"} · ${r.staff} staff on PIN 0000${r.keptOptOuts ? ` · ${r.keptOptOuts} opt-out(s) kept` : ""}`);
    for (const e of r.data.employees) console.log(`  ${on(e.active)} ${pad(e.login, 14)} ${pad(e.role, 8)} ${e.name}`);
  },
});

cmd({
  name: "restore",
  usage: "restore <file.json>",
  help: "Restore a snapshot (safety copy taken first)",
  run: async ([name]) => {
    if (!name) return fail("usage: restore <file.json>");
    const yes = await ask(c.amber(`Replace the live store with ${name}? [y/N] `));
    if (!/^y/i.test(yes)) return warn("cancelled");
    const r = await restoreBackup(name);
    ok(`restored ${r.restored} · safety copy ${r.safetyBackup}`);
  },
});

/* ---------------------------------- AI ---------------------------------- */

const history: ChatMessage[] = [];
async function aiTurn(text: string) {
  const d = await readStore();
  history.push({ role: "user", content: text });
  const result = await runMainframeTurn(d, history.slice(-12), { authorId: "emp-admin", newId, nowIso });
  await updateStore(() => d);
  history.push({ role: "assistant", content: result.reply });
  console.log(`\n${c.magenta(`Mainframe [${result.source}]`)} ${result.reply}`);
  for (const t of result.toolRuns) console.log(c.dim(`  ${t.ok ? "✓" : "✗"} ${t.tool}: ${t.summary.split("\n")[0].slice(0, 140)}`));
  console.log("");
}
cmd({
  name: "ai",
  aliases: ["mainframe", "ask"],
  usage: "ai <request>",
  help: "Talk to Mainframe AI (Claude with CRM tools). Plain text without a command does the same.",
  run: async (_a, raw) => aiTurn(raw.replace(/^(ai|mainframe|ask)\s*/i, "")),
});

cmd({ name: "clear", usage: "clear", help: "Clear the screen", run: async () => console.clear() });
cmd({ name: "exit", aliases: ["quit", "q"], usage: "exit", help: "Leave the console", run: async () => process.exit(0) });

/* --------------------------------- REPL --------------------------------- */

let rl: readline.Interface;
function ask(q: string): Promise<string> {
  return new Promise((res) => rl.question(q, (a) => res(a.trim())));
}

function split(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

async function dispatch(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;
  const [first, ...args] = split(trimmed);
  const def = commands.find((x) => x.name === first || x.aliases?.includes(first));
  if (def) {
    try {
      await def.run(args, trimmed);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    return;
  }
  await aiTurn(trimmed);
}

async function main() {
  const { dataDir } = storePaths();
  const histFile = path.join(dataDir, ".console_history");
  mkdirSync(dataDir, { recursive: true });
  const prior = existsSync(histFile) ? readFileSync(histFile, "utf8").split("\n").filter(Boolean).slice(-200) : [];

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: c.cyan("bhc› "),
    historySize: 500,
    completer: (line: string) => {
      const [first, ...rest] = line.split(/\s+/);
      if (rest.length === 0) {
        const names = commands.flatMap((x) => [x.name, ...(x.aliases ?? [])]).filter((n) => n.startsWith(first));
        return [names, first];
      }
      const subs: Record<string, string[]> = {
        lead: ["new", "status", "assign", "note"],
        job: ["status"],
        invoice: ["status"],
        ads: ["ingest", "add", "sources", "source", "all", "new", "drafted", "sent", "replied", "skipped"],
        ad: ["approve", "send", "skip", "replied", "won", "lost", "redraft", "edit", "restore"],
        outreach: ["approve", "send", "cancel", "pending_approval", "approved", "sent", "failed"],
        optouts: ["add"],
        inbox: ["send", "draft"],
        quote: ["new", "send", "pdf"],
        docs: ["make", "send"],
        pay: ["record", "link"],
        auto: ["tick", "run", "on", "off", "log"],
        hooks: ["presets", "add", "test", "on", "off", "rm", "events", "backlog", "retry", "log"],
      };
      const options = subs[first] ?? [];
      const partial = rest[rest.length - 1] ?? "";
      return [options.filter((o) => o.startsWith(partial)), partial];
    },
  });
  // @ts-expect-error history is writable at runtime
  rl.history = prior.reverse();

  // One-shot mode: npm run console -- status
  const oneShot = process.argv.slice(2).join(" ");
  if (oneShot) {
    await dispatch(oneShot);
    rl.close();
    return;
  }

  const ai = getAIStatus();
  console.log(c.bold(`\nBHC Console`) + c.dim(` · store ${storePaths().storePath}`));
  console.log(c.dim(`AI: ${ai.configured ? `${ai.provider} (${ai.model})` : "not configured — natural-language commands use the local parser; set ANTHROPIC_API_KEY for Claude"}`));
  console.log(c.dim(`Type "help" for commands, "env" for setup, "status" for the dashboard.\n`));
  rl.prompt();
  rl.on("line", async (line) => {
    if (line.trim()) appendFileSync(histFile, line.trim() + "\n");
    await dispatch(line);
    rl.prompt();
  });
  rl.on("close", () => {
    console.log(c.dim("\nbye"));
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
