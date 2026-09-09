import { describe, expect, it } from "vitest";
import { hashPassword, verifyStaffSecret } from "@/lib/auth-credentials";
import { buildSeedData } from "@/lib/seed";
import {
  applyPasswordReset,
  bootstrapStaffPassword,
  findStaffByLoginOrEmail,
  findValidResetToken,
  issuePasswordResetToken,
} from "@/lib/password-reset";
import { sanitizeStoreForClient } from "@/lib/store-client";

const ctx = {
  newId: () => `id-${Math.random().toString(16).slice(2)}`,
  nowIso: () => new Date().toISOString(),
};

describe("password reset", () => {
  it("issues hashed tokens and applies a new password once", () => {
    const data = buildSeedData();
    data.passwordResetTokens = [];
    const admin = findStaffByLoginOrEmail(data, "admin");
    expect(admin).toBeTruthy();
    const { rawToken } = issuePasswordResetToken(data, admin!.id, ctx);
    expect(data.passwordResetTokens).toHaveLength(1);
    expect(data.passwordResetTokens[0].tokenHash).toBe(hashPassword(rawToken));
    expect(findValidResetToken(data, rawToken)).toBeTruthy();
    expect(findValidResetToken(data, "bogus")).toBeNull();

    const first = applyPasswordReset(data, rawToken, "NewSecret99", ctx);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(verifyStaffSecret(first.employee, "NewSecret99")).toBe(true);
      expect(first.employee.mustChangePassword).toBe(false);
    }
    const reuse = applyPasswordReset(data, rawToken, "Another99", ctx);
    expect(reuse.ok).toBe(false);
  });

  it("rejects expired tokens", () => {
    const data = buildSeedData();
    data.passwordResetTokens = [];
    const admin = findStaffByLoginOrEmail(data, "admin")!;
    const { rawToken, record } = issuePasswordResetToken(data, admin.id, ctx);
    record.expiresAt = new Date(Date.now() - 1000).toISOString();
    expect(findValidResetToken(data, rawToken)).toBeNull();
    const r = applyPasswordReset(data, rawToken, "NewSecret99", ctx);
    expect(r.ok).toBe(false);
  });

  it("bootstraps staff back to default PIN", () => {
    const data = buildSeedData();
    const admin = findStaffByLoginOrEmail(data, "admin")!;
    admin.passwordHash = hashPassword("old-password");
    admin.mustChangePassword = false;
    bootstrapStaffPassword(admin);
    expect(admin.passwordHash).toBeNull();
    expect(admin.mustChangePassword).toBe(true);
    expect(verifyStaffSecret(admin, "0000")).toBe(true);
  });

  it("strips reset tokens from client sanitization", () => {
    const data = buildSeedData();
    data.passwordResetTokens = [
      {
        id: "t1",
        employeeId: "emp-admin",
        tokenHash: "abc",
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];
    const safe = sanitizeStoreForClient(data);
    expect(safe.passwordResetTokens).toEqual([]);
  });
});
