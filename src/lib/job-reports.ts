import { autosendKinds, deliverDocument } from "./deliver";
import { generateDocument } from "./documents";
import { live } from "./events";
import { enqueueNotification } from "./notifications";
import type { AppData } from "./types";

/**
 * Weekly customer progress reports: for every in-progress job that got site
 * updates in the last 7 days and has not had a report in that window,
 * generate a PDF (photos included). Delivered automatically when
 * DOCS_AUTOSEND contains "job_report"; otherwise the office gets an alert
 * with a one-click send on the job hub. Server-only (pdfkit).
 */

const WEEK = 7 * 86_400_000;

export async function runWeeklyJobReports(
  data: AppData,
  ctx: { newId: () => string; nowIso: () => string; now?: number },
): Promise<{ generated: number; sent: number; summary: string }> {
  const now = ctx.now ?? Date.now();
  const auto = autosendKinds().has("job_report");
  let generated = 0;
  let sent = 0;
  for (const job of data.jobs) {
    if (job.status !== "in_progress") continue;
    const recent = data.jobProgress.filter((p) => p.jobId === job.id && now - new Date(p.createdAt).getTime() < WEEK);
    if (!recent.length) continue;
    const lastReport = data.documents.find((d) => d.jobId === job.id && d.kind === "job_report");
    if (lastReport && now - new Date(lastReport.createdAt).getTime() < WEEK) continue;
    try {
      const doc = await generateDocument(data, { kind: "job_report", jobId: job.id, entryIds: recent.map((p) => p.id), title: `Week of ${new Date(now - WEEK).toLocaleDateString("en-CA")} — ${recent.length} site update(s)` }, { ...ctx, createdById: job.crewLeadId ?? "emp-admin" });
      generated += 1;
      if (auto) {
        const r = await deliverDocument(data, doc, ctx);
        if (r.email === "sent" || r.sms === "sent") sent += 1;
      } else {
        enqueueNotification(
          data,
          { employeeId: null, title: `Weekly report ready: ${job.title}`, body: `${recent.length} site update(s) this week — review and send from the job hub.`, href: `/admin/jobs/${job.id}`, dedupeKey: `job-report:${doc.id}` },
          ctx.newId,
          ctx.nowIso,
        );
      }
    } catch (err) {
      live.error("document", `Weekly report failed for ${job.title}`, err instanceof Error ? err.message : String(err));
    }
  }
  return { generated, sent, summary: `Weekly job reports: ${generated} generated${auto ? `, ${sent} sent to customers` : generated ? " (awaiting your send)" : ""}.` };
}
