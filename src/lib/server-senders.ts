import { sendEmail } from "./mail";
import type { Senders } from "./outreach-send";
import { sendSms, smsConfigStatus } from "./sms";

/**
 * Real senders for the outreach queue — only those that are configured.
 * Kept in a Node-safe module WITHOUT importing IMAP / scheduler so client
 * bundles (ai-client → mainframe-tools) never pull imapflow into webpack.
 */
export function serverSenders(): Senders {
  const senders: Senders = {};
  const mailOk = Boolean(
    (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) || process.env.RESEND_API_KEY,
  );
  if (mailOk) {
    senders.email = async (msg) => {
      const r = await sendEmail({ to: msg.to, subject: msg.subject, text: msg.text });
      return { ok: r.ok, provider: r.provider, id: r.id, error: r.error };
    };
  }
  if (smsConfigStatus().configured) {
    senders.sms = async (msg) => {
      const r = await sendSms({ to: msg.to, body: msg.body });
      return { ok: r.ok, provider: r.provider, id: r.id, error: r.error };
    };
  }
  return senders;
}
