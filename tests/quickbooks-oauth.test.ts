import { afterEach, describe, expect, it } from "vitest";
import { qbEnvironment, qbEnvironmentLabel } from "../src/lib/quickbooks-oauth";

describe("quickbooks-oauth environment", () => {
  const prev = process.env.QUICKBOOKS_ENV;

  afterEach(() => {
    if (prev === undefined) delete process.env.QUICKBOOKS_ENV;
    else process.env.QUICKBOOKS_ENV = prev;
  });

  it("defaults to production when QUICKBOOKS_ENV is unset", () => {
    delete process.env.QUICKBOOKS_ENV;
    expect(qbEnvironment()).toBe("production");
    expect(qbEnvironmentLabel()).toBe("Production (live books)");
  });

  it("honors sandbox override", () => {
    process.env.QUICKBOOKS_ENV = "sandbox";
    expect(qbEnvironment()).toBe("sandbox");
    expect(qbEnvironmentLabel()).toBe("Sandbox");
  });
});
