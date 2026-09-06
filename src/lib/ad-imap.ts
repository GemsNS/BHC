import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { parseAlertEmail, type RawAd } from "./ad-ingest";

/**
 * Poll a mailbox for (a) listing-alert emails from Kijiji / Craigslist /
 * Marketplace and (b) replies from prospects we emailed.
 * Server-only — imported by the scheduler and API routes, never by client code.
 *
 * Env:
 *   ADS_IMAP_HOST            imap.secureserver.net (GoDaddy) / outlook.office365.com / imap.gmail.com
 *   ADS_IMAP_PORT            993
 *   ADS_IMAP_USER / ADS_IMAP_PASS
 *   ADS_IMAP_SECURE          true
 *   ADS_IMAP_FOLDER          INBOX
 *   ADS_IMAP_ALERT_SENDERS   comma list treated as listing alerts (default kijiji.ca,craigslist.org,facebookmail.com,homestars.com)
 *   ADS_IMAP_MARK_SEEN       true — mark processed mails as read
 *   ADS_IMAP_MAX             30 mails per poll
 */

export type InboundMail = {
  from: string;
  fromAddress: string;
  subject: string;
  text: string;
  messageId: string | undefined;
  date: string | undefined;
};

export type ImapPollResult = {
  raws: RawAd[];
  /** Non-alert mails (possible replies from prospects) */
  others: InboundMail[];
  messages: number;
  error: string | null;
};

const DEFAULT_ALERT_SENDERS = ["kijiji.ca", "craigslist.org", "facebookmail.com", "homestars.com", "nextdoor.com"];

export function imapConfigured(): boolean {
  return Boolean(
    process.env.ADS_IMAP_HOST?.trim() &&
      process.env.ADS_IMAP_USER?.trim() &&
      process.env.ADS_IMAP_PASS?.trim(),
  );
}

export function imapSummary(): { configured: boolean; host: string | null; user: string | null; folder: string } {
  return {
    configured: imapConfigured(),
    host: process.env.ADS_IMAP_HOST?.trim() || null,
    user: process.env.ADS_IMAP_USER?.trim() ? process.env.ADS_IMAP_USER.trim().replace(/^(.{2}).+(@.*)$/, "$1…$2") : null,
    folder: process.env.ADS_IMAP_FOLDER?.trim() || "INBOX",
  };
}

export function alertSenders(): string[] {
  const raw = process.env.ADS_IMAP_ALERT_SENDERS ?? process.env.ADS_IMAP_SENDER_FILTER ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : DEFAULT_ALERT_SENDERS;
}

export async function pollImapInbox(): Promise<ImapPollResult> {
  if (!imapConfigured()) return { raws: [], others: [], messages: 0, error: "IMAP not configured (ADS_IMAP_*)." };
  const folder = process.env.ADS_IMAP_FOLDER?.trim() || "INBOX";
  const max = Math.max(1, Number(process.env.ADS_IMAP_MAX ?? "30") || 30);
  const markSeen = (process.env.ADS_IMAP_MARK_SEEN ?? "true").toLowerCase() !== "false";
  const alerts = alertSenders();

  const client = new ImapFlow({
    host: process.env.ADS_IMAP_HOST!.trim(),
    port: Number(process.env.ADS_IMAP_PORT ?? "993") || 993,
    secure: (process.env.ADS_IMAP_SECURE ?? "true").toLowerCase() !== "false",
    auth: { user: process.env.ADS_IMAP_USER!.trim(), pass: process.env.ADS_IMAP_PASS!.trim() },
    logger: false,
  });

  const raws: RawAd[] = [];
  const others: InboundMail[] = [];
  let messages = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      const uids = (await client.search({ seen: false }, { uid: true })) || [];
      const batch = uids.slice(-max);
      for (const uid of batch) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const from = parsed.from?.text ?? "";
        const fromAddress = parsed.from?.value?.[0]?.address?.toLowerCase() ?? "";
        messages += 1;
        const isAlert = alerts.some((a) => fromAddress.includes(a) || from.toLowerCase().includes(a));
        if (isAlert) {
          raws.push(
            ...parseAlertEmail({
              subject: parsed.subject ?? "",
              text: parsed.text ?? undefined,
              html: typeof parsed.html === "string" ? parsed.html : undefined,
              from,
              messageId: parsed.messageId ?? undefined,
              receivedAt: parsed.date?.toISOString(),
            }),
          );
        } else {
          others.push({
            from,
            fromAddress,
            subject: parsed.subject ?? "",
            text: (parsed.text ?? "").trim().slice(0, 4000),
            messageId: parsed.messageId ?? undefined,
            date: parsed.date?.toISOString(),
          });
        }
        if (markSeen) await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return { raws, others, messages, error: null };
  } catch (err) {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    return { raws, others, messages, error: err instanceof Error ? err.message : "IMAP error" };
  }
}
