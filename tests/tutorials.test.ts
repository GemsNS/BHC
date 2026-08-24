import { describe, expect, it } from "vitest";
import {
  modulesForRole,
  orderedPathModules,
  roleHasModuleAccess,
  TUTORIAL_MODULES,
  walkthroughForRole,
} from "../src/lib/tutorials";
import { ROLE_PERMISSIONS } from "../src/lib/types";
import { ADMIN_NAV } from "../src/lib/nav";

describe("tutorials", () => {
  it("registers tutorials in admin nav with board permission", () => {
    const item = ADMIN_NAV.find((n) => n.href === "/admin/tutorials");
    expect(item?.perm).toBe("board");
  });

  it("filters modules by role permissions", () => {
    const knocker = modulesForRole("knocker");
    expect(knocker.some((m) => m.id === "knocker-field")).toBe(true);
    expect(knocker.some((m) => m.id === "users")).toBe(false);

    const admin = modulesForRole("admin");
    expect(admin.length).toBeGreaterThan(knocker.length);
    expect(admin.some((m) => m.id === "users")).toBe(true);
  });

  it("builds an ordered start path for each role", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as Array<
      keyof typeof ROLE_PERMISSIONS
    >) {
      const path = orderedPathModules(role);
      expect(path.length).toBeGreaterThan(0);
      expect(path.every((m) => roleHasModuleAccess(role, m))).toBe(true);
      const walk = walkthroughForRole(role);
      expect(walk.role).toBe(role);
    }
  });

  it("covers every major surface with a module", () => {
    const ids = new Set(TUTORIAL_MODULES.map((m) => m.id));
    for (const required of [
      "login",
      "command-deck",
      "jarvis",
      "sales-hub",
      "knocker-field",
      "mainframe",
      "inventory",
      "clock",
    ]) {
      expect(ids.has(required)).toBe(true);
    }
  });
});
