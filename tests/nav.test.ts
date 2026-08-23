import { describe, expect, it } from "vitest";
import { isNavItemActive } from "@/lib/nav";

describe("isNavItemActive", () => {
  it("matches exact paths", () => {
    expect(isNavItemActive("/admin/stats", "/admin/stats")).toBe(true);
  });

  it("does not false-positive on similar prefixes", () => {
    expect(isNavItemActive("/admin/invoices", "/admin/inventory")).toBe(false);
    expect(isNavItemActive("/admin/assistant", "/admin/dashboard")).toBe(false);
  });

  it("matches sales hub and legacy CRM routes", () => {
    expect(isNavItemActive("/admin/sales", "/admin/sales")).toBe(true);
    expect(isNavItemActive("/admin/leads", "/admin/sales")).toBe(true);
    expect(isNavItemActive("/admin/outreach", "/admin/sales")).toBe(true);
  });
});
