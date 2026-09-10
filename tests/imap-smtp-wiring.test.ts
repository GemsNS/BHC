import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { imapHostFromSmtp, resolveImapConfig, imapConfigured } from "@/lib/ad-imap";
import { ensureImapAdSource } from "@/lib/ad-ingest";
import { buildSeedData } from "@/lib/seed";

const KEYS = [
  "ADS_IMAP_HOST",
  "ADS_IMAP_USER",
  "ADS_IMAP_PASS",
  "ADS_IMAP_ENABLED",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
] as const;

describe("IMAP SMTP fallback wiring", () => {
  const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("maps Office 365 SMTP host to outlook IMAP", () => {
    expect(imapHostFromSmtp("smtp.office365.com")).toBe("outlook.office365.com");
    expect(imapHostFromSmtp("smtp.gmail.com")).toBe("imap.gmail.com");
    expect(imapHostFromSmtp("smtpout.secureserver.net")).toBe("imap.secureserver.net");
  });

  it("resolves IMAP from SMTP_* when ADS_IMAP_* is unset", () => {
    delete process.env.ADS_IMAP_HOST;
    delete process.env.ADS_IMAP_USER;
    delete process.env.ADS_IMAP_PASS;
    process.env.ADS_IMAP_ENABLED = "1";
    process.env.SMTP_HOST = "smtp.office365.com";
    process.env.SMTP_USER = "info@bhcontracting.ca";
    process.env.SMTP_PASS = "secret";
    const cfg = resolveImapConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.host).toBe("outlook.office365.com");
    expect(cfg!.user).toBe("info@bhcontracting.ca");
    expect(cfg!.pass).toBe("secret");
    expect(cfg!.fromSmtpFallback).toBe(true);
    expect(imapConfigured()).toBe(true);
  });

  it("can be disabled with ADS_IMAP_ENABLED=0", () => {
    process.env.ADS_IMAP_ENABLED = "0";
    process.env.SMTP_HOST = "smtp.office365.com";
    process.env.SMTP_USER = "info@bhcontracting.ca";
    process.env.SMTP_PASS = "secret";
    expect(resolveImapConfig()).toBeNull();
    expect(imapConfigured()).toBe(false);
  });

  it("ensureImapAdSource creates an enabled imap source when SMTP is set", () => {
    delete process.env.ADS_IMAP_HOST;
    process.env.SMTP_HOST = "smtp.office365.com";
    process.env.SMTP_USER = "info@bhcontracting.ca";
    process.env.SMTP_PASS = "secret";
    process.env.ADS_IMAP_ENABLED = "1";
    const data = buildSeedData();
    data.adSources = [];
    const src = ensureImapAdSource(data, {
      newId: () => "id-1",
      nowIso: () => "2026-01-01T00:00:00.000Z",
    });
    expect(src?.type).toBe("imap");
    expect(src?.enabled).toBe(true);
    expect(data.adSources).toHaveLength(1);
    ensureImapAdSource(data, { newId: () => "id-2", nowIso: () => "2026-01-01T00:00:00.000Z" });
    expect(data.adSources).toHaveLength(1);
  });
});
