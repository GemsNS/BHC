/**
 * Optional Cloudflare Turnstile / hCaptcha verification.
 * When CAPTCHA_SECRET is unset, verification is skipped (dev-friendly).
 */

export type CaptchaResult = { ok: boolean; skipped?: boolean; error?: string };

export function captchaConfigured(): boolean {
  return Boolean(process.env.CAPTCHA_SECRET?.trim() || process.env.TURNSTILE_SECRET_KEY?.trim());
}

export async function verifyCaptchaToken(input: {
  token?: string | null;
  ip?: string;
}): Promise<CaptchaResult> {
  const secret =
    process.env.CAPTCHA_SECRET?.trim() ||
    process.env.TURNSTILE_SECRET_KEY?.trim() ||
    process.env.HCAPTCHA_SECRET?.trim();

  if (!secret) {
    return { ok: true, skipped: true };
  }

  const token = input.token?.trim();
  if (!token) {
    return { ok: false, error: "Captcha required." };
  }

  const provider = (process.env.CAPTCHA_PROVIDER || "turnstile").toLowerCase();
  const endpoint =
    provider === "hcaptcha"
      ? "https://hcaptcha.com/siteverify"
      : "https://challenges.cloudflare.com/turnstile/v0/siteverify";

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (input.ip) body.set("remoteip", input.ip);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return { ok: false, error: "Captcha verification failed." };
    const json = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!json.success) {
      return { ok: false, error: "Captcha rejected." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Captcha verification unavailable." };
  }
}

export function publicCaptchaSiteKey(): string | null {
  return (
    process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ||
    null
  );
}
