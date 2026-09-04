import { afterEach, describe, expect, it } from "vitest";
import { mailConfigStatus } from "../src/lib/mail";

describe("mailConfigStatus", () => {
  const envKeys = [
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "RESEND_API_KEY",
    "CONTACT_TO_EMAIL",
  ] as const;
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of envKeys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  });

  function snapshotEnv() {
    for (const key of envKeys) prev[key] = process.env[key];
  }

  it("reports none when unset", () => {
    snapshotEnv();
    for (const key of envKeys) delete process.env[key];
    expect(mailConfigStatus()).toEqual({
      configured: false,
      provider: "none",
      to: null,
      from: null,
    });
  });

  it("prefers SMTP when GoDaddy credentials are set", () => {
    snapshotEnv();
    process.env.SMTP_HOST = "smtpout.secureserver.net";
    process.env.SMTP_USER = "quotes@bhcontracting.ca";
    process.env.SMTP_PASS = "secret";
    process.env.RESEND_API_KEY = "re_test";
    process.env.CONTACT_TO_EMAIL = "info@bhcontracting.ca";
    const status = mailConfigStatus();
    expect(status.configured).toBe(true);
    expect(status.provider).toBe("smtp");
    expect(status.to).toBe("info@bhcontracting.ca");
  });

  it("falls back to resend when only RESEND_API_KEY is set", () => {
    snapshotEnv();
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    process.env.RESEND_API_KEY = "re_test";
    const status = mailConfigStatus();
    expect(status.configured).toBe(true);
    expect(status.provider).toBe("resend");
  });
});
