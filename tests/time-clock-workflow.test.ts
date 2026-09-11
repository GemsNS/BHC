import { describe, expect, it, afterEach } from "vitest";
import {
  autoCloseOverLimitPunches,
  formatDuration,
  isPunchOverLimit,
  LUNCH_DEDUCT_MS,
  LUNCH_DEDUCT_MINUTES,
  MAX_SHIFT_MS,
  paidDurationMs,
  punchDurationMs,
} from "@/lib/time-clock";
import { paymentsStatus, stripeConfigured, createStripeCheckout } from "@/lib/payments";
import { sendSms, smsConfigStatus, twilioEnabled } from "@/lib/sms";
import { canViewPayroll, sanitizeStoreForClient } from "@/lib/store-client";
import { buildSeedData } from "@/lib/seed";
import { executeMainframeTool } from "@/lib/mainframe-tools";
import { ROLE_PERMISSIONS } from "@/lib/types";

describe("time-clock paid hours", () => {
  it("deducts 30 minutes lunch when punch exceeds 30 minutes", () => {
    const start = "2026-09-08T08:00:00.000Z";
    const end = "2026-09-08T16:00:00.000Z"; // 8h gross
    expect(punchDurationMs(start, end)).toBe(8 * 3_600_000);
    expect(paidDurationMs(start, end)).toBe(8 * 3_600_000 - LUNCH_DEDUCT_MS);
    expect(LUNCH_DEDUCT_MINUTES).toBe(30);
  });

  it("does not deduct lunch on punches ≤ 30 minutes", () => {
    const start = "2026-09-08T08:00:00.000Z";
    const end = "2026-09-08T08:25:00.000Z";
    expect(paidDurationMs(start, end)).toBe(25 * 60_000);
  });

  it("caps open punches at 12 hours and marks over-limit", () => {
    const start = "2026-09-08T08:00:00.000Z";
    const now = new Date("2026-09-08T21:00:00.000Z").getTime(); // 13h later
    expect(isPunchOverLimit(start, null, now)).toBe(true);
    expect(paidDurationMs(start, null, now)).toBe(MAX_SHIFT_MS - LUNCH_DEDUCT_MS);
  });

  it("auto-closes punches past 12 hours", () => {
    const start = "2026-09-08T08:00:00.000Z";
    const now = new Date("2026-09-08T21:00:00.000Z").getTime();
    const entries = [
      {
        id: "t1",
        employeeId: "e1",
        clockIn: start,
        clockOut: null as string | null,
        jobId: null,
        notes: "",
      },
    ];
    const { closed } = autoCloseOverLimitPunches(entries, now);
    expect(closed).toBe(1);
    expect(entries[0].clockOut).toBe(
      new Date(new Date(start).getTime() + MAX_SHIFT_MS).toISOString(),
    );
    expect(entries[0].notes).toMatch(/12-hour/);
    expect(formatDuration(paidDurationMs(start, entries[0].clockOut))).toMatch(/h/);
  });
});

describe("stripe cut from workflow", () => {
  it("never reports Stripe as configured", () => {
    expect(stripeConfigured()).toBe(false);
    expect(paymentsStatus().stripe).toBe(false);
  });

  it("rejects checkout creation", async () => {
    const data = buildSeedData();
    const inv = {
      id: "inv-x",
      jobId: data.jobs[0]?.id ?? "j",
      kind: "invoice" as const,
      status: "sent" as const,
      customerName: "Test",
      lines: [{ id: "l", description: "x", quantity: 1, unitPrice: 100 }],
      includeProgress: false,
      progressEntryIds: [] as string[],
      notes: "",
      aiSummary: null,
      createdAt: new Date().toISOString(),
      createdById: "emp-admin",
      token: "tok",
    };
    const r = await createStripeCheckout(data, inv, {
      newId: () => "n",
      nowIso: () => new Date().toISOString(),
    });
    expect(r.url).toBeNull();
    expect(r.error).toMatch(/disabled/i);
  });
});

describe("twilio kill-switch", () => {
  afterEach(() => {
    delete process.env.TWILIO_ENABLED;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
  });

  it("defaults to disabled even when keys are present", async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_FROM_NUMBER = "+19025550000";
    delete process.env.TWILIO_ENABLED;
    expect(twilioEnabled()).toBe(false);
    const status = smsConfigStatus();
    expect(status.configured).toBe(false);
    expect(status.pendingApproval).toBe(true);
    const r = await sendSms({ to: "902-555-0142", body: "hi" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/compliance|TWILIO_ENABLED/i);
  });

  it("sends when TWILIO_ENABLED=1", async () => {
    process.env.TWILIO_ENABLED = "1";
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "tok";
    process.env.TWILIO_FROM_NUMBER = "+19025550000";
    const fetcher = (async () =>
      new Response(JSON.stringify({ sid: "SM1" }), { status: 201 })) as unknown as typeof fetch;
    const r = await sendSms({ to: "902-555-0142", body: "hi" }, fetcher);
    expect(r.ok).toBe(true);
    expect(r.id).toBe("SM1");
  });
});

describe("staff RBAC visibility", () => {
  it("field role cannot open payroll hours page", () => {
    expect(ROLE_PERMISSIONS.field.includes("hours")).toBe(false);
    expect(ROLE_PERMISSIONS.field.includes("clock")).toBe(true);
    expect(ROLE_PERMISSIONS.office.includes("hours")).toBe(true);
  });

  it("sanitizes time entries and rates for non-payroll roles", () => {
    const data = buildSeedData();
    const field = data.employees.find((e) => e.role === "field") ?? data.employees[0];
    field.role = "field";
    const other = data.employees.find((e) => e.id !== field.id)!;
    data.timeEntries = [
      {
        id: "te-me",
        employeeId: field.id,
        clockIn: "2026-09-08T08:00:00.000Z",
        clockOut: "2026-09-08T12:00:00.000Z",
        jobId: null,
        notes: "",
      },
      {
        id: "te-other",
        employeeId: other.id,
        clockIn: "2026-09-08T08:00:00.000Z",
        clockOut: "2026-09-08T12:00:00.000Z",
        jobId: null,
        notes: "",
      },
    ];
    expect(canViewPayroll("field")).toBe(false);
    const sanitized = sanitizeStoreForClient(data, field);
    expect(sanitized.timeEntries.every((t) => t.employeeId === field.id)).toBe(true);
    expect(sanitized.employees.find((e) => e.id === other.id)?.hourlyRate).toBe(0);
  });
});

describe("mainframe CRM writes", () => {
  it("create_job writes into the CRM store", () => {
    const data = buildSeedData();
    const before = data.jobs.length;
    const result = executeMainframeTool(
      data,
      "create_job",
      {
        title: "Siding — Test St",
        customerName: "Audit Customer",
        address: "1 Test St, Dartmouth NS",
        estimatedValue: 4500,
      },
      {
        authorId: "emp-admin",
        newId: () => `job-${Math.random().toString(16).slice(2)}`,
        nowIso: () => new Date().toISOString(),
      },
    );
    expect(result.ok).toBe(true);
    expect(data.jobs.length).toBe(before + 1);
    expect(data.jobs[0].title).toBe("Siding — Test St");
    expect(data.jobs[0].customerName).toBe("Audit Customer");
  });
});
