import { describe, expect, it } from "vitest";
import { needsPasswordSetup } from "../src/lib/auth-credentials";
import {
  mergeClientStoreUpdate,
  sanitizeEmployeeForClient,
} from "../src/lib/store-client";
import { buildSeedData } from "../src/lib/seed";
import type { Employee } from "../src/lib/types";

describe("needsPasswordSetup", () => {
  it("respects mustChangePassword false even without passwordHash", () => {
    expect(
      needsPasswordSetup({
        mustChangePassword: false,
        passwordHash: null,
        hasPassword: true,
      }),
    ).toBe(false);
  });

  it("requires setup when mustChangePassword is true", () => {
    expect(needsPasswordSetup({ mustChangePassword: true, hasPassword: false })).toBe(
      true,
    );
  });

  it("uses hasPassword when hash is stripped", () => {
    expect(needsPasswordSetup({ hasPassword: true })).toBe(false);
    expect(needsPasswordSetup({ hasPassword: false })).toBe(true);
  });

  it("falls back to passwordHash for local demo store", () => {
    expect(needsPasswordSetup({ passwordHash: "abc" })).toBe(false);
    expect(needsPasswordSetup({ passwordHash: null })).toBe(true);
  });
});

describe("store-client", () => {
  it("strips pin and passwordHash from API responses", () => {
    const employee: Employee = {
      id: "emp-admin",
      name: "Admin",
      email: "admin@test",
      login: "admin",
      pin: "0000",
      passwordHash: "deadbeef",
      mustChangePassword: false,
      role: "admin",
      phone: "",
      hireDate: "2024-01-01",
      hourlyRate: 0,
      active: true,
    };
    const safe = sanitizeEmployeeForClient(employee);
    expect(safe.pin).toBe("");
    expect(safe.passwordHash).toBeNull();
    expect(safe.hasPassword).toBe(true);
    expect(safe.mustChangePassword).toBe(false);
  });

  it("preserves server credentials on client PUT", () => {
    const data = buildSeedData();
    const admin = data.employees.find((e) => e.id === "emp-admin");
    if (!admin) throw new Error("missing admin");
    admin.passwordHash = "server-hash";
    admin.pin = "9999";
    admin.mustChangePassword = false;

    const clientPayload = {
      ...data,
      employees: data.employees.map((e) =>
        sanitizeEmployeeForClient(e),
      ),
    };

    const merged = mergeClientStoreUpdate(data, clientPayload);
    const mergedAdmin = merged.employees.find((e) => e.id === "emp-admin");
    expect(mergedAdmin?.passwordHash).toBe("server-hash");
    expect(mergedAdmin?.pin).toBe("9999");
  });
});
