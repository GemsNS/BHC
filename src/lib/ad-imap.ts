import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { parseAlertEmail, type RawAd } from "./ad-ingest";

/**
 * Poll a mailbox for (a) listing-alert emails from Kijiji / Craigslist /
 * Marketplace and (b) replies from prospects we emailed.
 * Server-only — imported by the scheduler and API routes, never by client code.
 *
 * Env (ADS_IMAP_* preferred; falls back to SMTP_* so the Office 365 mailbox
 * already used for outbound mail also receives Kijiji/Craigslist/Facebook alerts):
 *   ADS_IMAP_HOST            outlook.office365.com (auto from smtp.office365.com)
 *   ADS_IMAP_PORT            993
 *   ADS_IMAP_USER / ADS_IMAP_PASS  (fallback: SMTP_USER / SMTP_PASS)
 *   ADS_IMAP_SECURE          true
 *   ADS_IMAP_FOLDER          INBOX
 *   ADS_IMAP_ALERT_SENDERS   kijiji.ca,craigslist.org,facebookmail.com,homestars.com
 *   ADS_IMAP_MARK_SEEN       true
 *   ADS_IMAP_MAX             30
 *   ADS_IMAP_ENABLED         set to 0 to disable even when SMTP is configured
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

export type ImapResolvedConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  folder: string;
  fromSmtpFallback: boolean;
};

const DEFAULT_ALERT_SENDERS = ["kijiji.ca", "craigslist.org", "facebookmail.com", "homestars.com", "nextdoor.com"];

/** Map common SMTP hosts to their IMAP counterparts. */
export function imapHostFromSmtp(smtpHost: string | undefined | null): string | null {
  const h = smtpHost?.trim().toLowerCase();
  if (!h) return null;
  if (h === "smtp.office365.com" || h === "smtp-mail.outlook.com") return "outlook.office365.com";
  if (h === "smtp.gmail.com") return "imap.gmail.com";
  if (h === "smtpout.secureserver.net" || h === "smtp.secureserver.net") return "imap.secureserver.net";
  // Generic: smtp.X → imap.X when the prefix matches
  if (h.startsWith("smtp.")) return `imap.${h.slice(5)}`;
  return h;
}

export function resolveImapConfig(): ImapResolvedConfig | null {
  const disabled = (process.env.ADS_IMAP_ENABLED ?? "1").trim().toLowerCase();
  if (disabled === "0" || disabled === "false" || disabled === "off") return null;

  const user = (process.env.ADS_IMAP_USER?.trim() || process.env.SMTP_USER?.trim() || "").trim();
  const pass = (process.env.ADS_IMAP_PASS?.trim() || process.env.SMTP_PASS?.trim() || "").trim();
  const explicitHost = process.env.ADS_IMAP_HOST?.trim() || "";
  const host = explicitHost || imapHostFromSmtp(process.env.SMTP_HOST) || "";
  if (!host || !user || !pass) return null;

  const fromSmtpFallback = !process.env.ADS_IMAP_HOST?.trim() || !process.env.ADS_IMAP_USER?.trim() || !process.env.ADS_IMAP_PASS?.trim();

  return {
    host,
    port: Number(process.env.ADS_IMAP_PORT ?? "993") || 993,
    secure: (process.env.ADS_IMAP_SECURE ?? "true").toLowerCase() !== "false",
    user,
    pass,
    folder: process.env.ADS_IMAP_FOLDER?.trim() || "INBOX",
    fromSmtpFallback,
  };
}

export function imapConfigured(): boolean {
  return resolveImapConfig() !== null;
}

export function imapSummary(): {
  configured: boolean;
  host: string | null;
  user: string | null;
  folder: string;
  fromSmtpFallback: boolean;
} {
  const cfg = resolveImapConfig();
  return {
    configured: Boolean(cfg),
    host: cfg?.host ?? null,
    user: cfg?.user ? cfg.user.replace(/^(.{2}).+(@.*)$/, "$1…$2") : null,
    folder: cfg?.folder ?? "INBOX",
    fromSmtpFallback: cfg?.fromSmtpFallback ?? false,
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
  const cfg = resolveImapConfig();
  if (!cfg) return { raws: [], others: [], messages: 0, error: "IMAP not configured (set ADS_IMAP_* or SMTP_*)." };
  const folder = cfg.folder;
  const max = Math.max(1, Number(process.env.ADS_IMAP_MAX ?? "30") || 30);
  const markSeen = (process.env.ADS_IMAP_MARK_SEEN ?? "true").toLowerCase() !== "false";
  const alerts = alertSenders();

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
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
        let parsedAds = 0;
        if (isAlert) {
          const ads = parseAlertEmail({
            subject: parsed.subject ?? "",
            text: parsed.text ?? undefined,
            html: typeof parsed.html === "string" ? parsed.html : undefined,
            from,
            messageId: parsed.messageId ?? undefined,
            receivedAt: parsed.date?.toISOString(),
          });
          parsedAds = ads.length;
          raws.push(...ads);
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
        // Never mark Kijiji digests as Seen when we extracted 0 listing URLs —
        // otherwise a broken parse permanently burns the alert.
        const markEmptyAlerts =
          (process.env.ADS_IMAP_MARK_EMPTY_ALERTS ?? "false").toLowerCase() === "true";
        if (markSeen && (!isAlert || parsedAds > 0 || markEmptyAlerts)) {
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        }
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
