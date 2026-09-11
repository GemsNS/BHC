import { describe, expect, it } from "vitest";
import { ADMIN_NAV, ADMIN_NAV_SECTIONS, isNavItemActive } from "@/lib/nav";

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

describe("God's Eye nav entry", () => {
  it("registers /admin/gods-eye under Overview with dashboard perm", () => {
    const item = ADMIN_NAV.find((n) => n.href === "/admin/gods-eye");
    expect(item?.label).toMatch(/God'?s Eye/i);
    expect(item?.perm).toBe("dashboard");
    const overview = ADMIN_NAV_SECTIONS.find((s) => s.id === "overview");
    expect(overview?.items.some((i) => i.href === "/admin/gods-eye")).toBe(true);
  });
});
