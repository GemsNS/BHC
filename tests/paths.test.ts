import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getBasePath, withBasePath } from "@/lib/paths";

describe("withBasePath", () => {
  const prev = process.env.NEXT_PUBLIC_BASE_PATH;

  afterEach(() => {
    process.env.NEXT_PUBLIC_BASE_PATH = prev;
  });

  it("returns path unchanged when no base path", () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "";
    expect(withBasePath("/admin/dashboard")).toBe("/admin/dashboard");
  });

  it("prefixes once for fetch URLs", () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/BHC";
    expect(withBasePath("/api/store")).toBe("/BHC/api/store");
  });

  it("does not double-prefix", () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/BHC";
    expect(withBasePath("/BHC/admin/sales")).toBe("/BHC/admin/sales");
  });
});

describe("getBasePath", () => {
  it("reads env", () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/BHC";
    expect(getBasePath()).toBe("/BHC");
  });
});
