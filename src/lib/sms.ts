/**
 * SMS via Twilio's REST API (plain fetch — no SDK). Server-side only in
 * practice because the env vars are not exposed to the browser.
 *
 * Env:
 *   TWILIO_ENABLED=0|1            default 0 while compliance pending
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER            E.164, e.g. +19025550123   (or)
 *   TWILIO_MESSAGING_SERVICE_SID  MG…  (preferred once you have one)
 */

export type SmsMessage = { to: string; body: string };

export type SmsResult = {
  ok: boolean;
  provider: "twilio" | "none";
  id: string | null;
  error: string | null;
};

export type SmsConfigStatus = {
  configured: boolean;
  provider: "twilio" | "none";
  from: string | null;
  /** True when keys exist but TWILIO_ENABLED is off (compliance hold). */
  pendingApproval: boolean;
};

function env(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const v = process.env?.[name]?.trim();
  return v || undefined;
}

/** Explicit kill-switch. Default OFF until compliance clears and TWILIO_ENABLED=1. */
export function twilioEnabled(): boolean {
  const v = (env("TWILIO_ENABLED") ?? "0").toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function smsConfigStatus(): SmsConfigStatus {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_MESSAGING_SERVICE_SID") ?? env("TWILIO_FROM_NUMBER") ?? null;
  const keysPresent = Boolean(sid && token && from);
  const enabled = twilioEnabled();
  const configured = keysPresent && enabled;
  return {
    configured,
    provider: configured ? "twilio" : "none",
    from: keysPresent ? from : null,
    pendingApproval: keysPresent && !enabled,
  };
}

/** Normalize a North-American phone number to E.164. Returns null when it cannot. */
export function toE164(raw: string, defaultCountry = "1"): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) {
    const d = digits.slice(1);
    return d.length >= 10 && d.length <= 15 ? `+${d}` : null;
  }
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function sendSms(
  msg: SmsMessage,
  fetcher: typeof fetch = fetch,
): Promise<SmsResult> {
  const status = smsConfigStatus();
  if (status.pendingApproval) {
    return {
      ok: false,
      provider: "none",
      id: null,
      error: "SMS pending Twilio compliance approval (TWILIO_ENABLED=0).",
    };
  }
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const service = env("TWILIO_MESSAGING_SERVICE_SID");
  const from = env("TWILIO_FROM_NUMBER");
  if (!sid || !token || (!service && !from) || !twilioEnabled()) {
    return { ok: false, provider: "none", id: null, error: "SMS not configured (TWILIO_*)." };
  }
  const to = toE164(msg.to);
  if (!to) return { ok: false, provider: "twilio", id: null, error: `Invalid phone number: ${msg.to}` };

  const params = new URLSearchParams({ To: to, Body: msg.body });
  if (service) params.set("MessagingServiceSid", service);
  else if (from) params.set("From", from);

  try {
    const res = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!res.ok) {
      return {
        ok: false,
        provider: "twilio",
        id: null,
        error: json.message ? `Twilio ${json.code ?? res.status}: ${json.message}` : `HTTP ${res.status}`,
      };
    }
    return { ok: true, provider: "twilio", id: json.sid ?? null, error: null };
  } catch (err) {
    return {
      ok: false,
      provider: "twilio",
      id: null,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}
