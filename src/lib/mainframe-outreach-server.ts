import type { AppData } from "./types";
import { type ToolContext, type ToolExecution } from "./mainframe-tools";

/**
 * Server-only tool implementation for the MAINFRAME "send_outreach" action.
 *
 * This module must not be imported by client bundles, otherwise bundlers try
 * to include Node-only mail implementations (nodemailer) → browser build fails.
 */
export async function toolSendOutreachAsync(
  data: AppData,
  ctx: ToolContext,
): Promise<ToolExecution> {
  const { processOutreachQueue } = await import("./outreach-send");
  const { serverSenders } = await import("./server-senders");
  const senders = serverSenders();

  if (!senders.email && !senders.sms) {
    return {
      ok: false,
      summary:
        "No email/SMS sender configured. Set SMTP_* (or RESEND_API_KEY) and/or TWILIO_* with TWILIO_ENABLED=1.",
    };
  }

  const approved = data.outreachQueue.filter((o) => o.status === "approved").length;
  if (!approved) {
    return {
      ok: true,
      summary:
        "No approved outreach to send. Approve drafts first (approve_outreach), then send_outreach.",
    };
  }

  const result = await processOutreachQueue(data, ctx, senders);
  return {
    ok: result.failed === 0,
    summary:
      result.summary ||
      `Sent ${result.sent}, failed ${result.failed}, deferred ${result.deferred}, skipped ${result.skipped}.`,
    data: {
      sent: result.sent,
      failed: result.failed,
      deferred: result.deferred,
      skipped: result.skipped,
    },
  };
}

