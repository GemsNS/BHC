import { describe, expect, it } from "vitest";
import { DEFAULT_STAFF_PIN, hashPassword } from "../src/lib/auth-credentials";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { normalizeStore } from "../src/lib/normalize";
import { reseedStore } from "../src/lib/reseed";

describe("reseed", () => {
  it("keeps staff (reset to PIN 0000, password cleared) and opt-outs, wipes everything else", () => {
    const current = normalizeStore(buildDemoSeedData());
    current.employees[0].passwordHash = hashPassword("secret123");
    current.employees[0].mustChangePassword = false;
    current.employees[0].pin = "9182";
    current.employees.push({ ...current.employees[1], id: "emp-new", login: "walid", name: "Walid K", email: "walid@bhcontracting.ca", role: "field" });
    current.optOuts.push({ id: "o1", channel: "sms", address: "+19025550142", reason: "STOP", source: "sms_inbound", createdAt: new Date().toISOString() });
    const leadsBefore = current.leads.length;

    const r = reseedStore(current);
    expect(r.staff).toBe(current.employees.length);
    expect(r.data.employees.map((e) => e.login)).toEqual(current.employees.map((e) => e.login));
    for (const e of r.data.employees) {
      expect(e.pin).toBe(DEFAULT_STAFF_PIN);
      expect(e.passwordHash).toBeNull();
      expect(e.mustChangePassword).toBe(true);
    }
    expect(r.data.employees.find((e) => e.login === "walid")?.role).toBe("field");
    expect(r.keptOptOuts).toBe(1);
    expect(r.data.optOuts[0].address).toBe("+19025550142");
    // business data wiped; production seed keeps the durable Walid job
    expect(leadsBefore).toBeGreaterThan(0);
    expect(r.data.leads.map((l) => l.id)).toEqual(["lead-walid"]);
    expect(r.data.jobs.map((j) => j.id)).toEqual(["job-walid"]);
    expect(r.data.adListings).toEqual([]);
    expect(r.data.messages).toEqual([]);
    expect(r.data.assistantAutomations.length).toBeGreaterThan(10);
  });

  it("fresh-staff mode uses the default role accounts and can drop opt-outs", () => {
    const current = normalizeStore(buildDemoSeedData());
    current.optOuts.push({ id: "o1", channel: "email", address: "x@y.z", reason: "no", source: "manual", createdAt: new Date().toISOString() });
    const r = reseedStore(current, { keepStaff: false, keepOptOuts: false });
    expect(r.data.employees.some((e) => e.login === "admin")).toBe(true);
    expect(r.data.optOuts).toEqual([]);
    expect(r.keptOptOuts).toBe(0);
  });

  it("guarantees an active admin survives", () => {
    const current = normalizeStore(buildDemoSeedData());
    for (const e of current.employees) if (e.role === "admin") e.active = false;
    const r = reseedStore(current);
    expect(r.data.employees.some((e) => e.role === "admin" && e.active)).toBe(true);
  });
});
