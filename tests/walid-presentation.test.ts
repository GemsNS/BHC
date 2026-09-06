import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import {
  hashPresentationPassword,
  verifyPresentationPassword,
} from "../src/lib/presentations";
import meta from "../presentations/walid/meta.json";
import manifest from "../presentations/walid/manifest.json";

describe("walid presentation package", () => {
  it("password walid matches stored SHA-256", () => {
    expect(hashPresentationPassword("walid")).toBe(meta.passwordSha256);
    expect(verifyPresentationPassword("walid", meta.passwordSha256)).toBe(true);
    expect(verifyPresentationPassword("wrong", meta.passwordSha256)).toBe(false);
  });

  it("includes core package deliverables and design systems", () => {
    const paths = new Set(manifest.files.map((f) => f.path));
    const required = [
      "00_README.md",
      "01_Model/walid_warehouse.glb",
      "03_Contract/Walid_Siding_Contract.md",
      "03_Contract/Walid_Siding_Contract.docx",
      "05_Design_Options/walid_system_01_cedar-datum.png",
      "05_Design_Options/walid_system_02_full-battens.png",
      "05_Design_Options/walid_system_03_split-storey.png",
      "05_Design_Options/walid_system_04_framed-bays.png",
      "06_Site_Photos/site_existing_04.webp",
      "07_Permit/walid_permit_drawings.pdf",
    ];
    for (const r of required) {
      expect(paths.has(r), `missing ${r}`).toBe(true);
    }
    expect(manifest.files.length).toBeGreaterThanOrEqual(45);
  });

  it("prices 3-week job + 1-week pushback fuel into the siding contract", () => {
    const contract = readFileSync(
      "presentations/walid/package/03_Contract/Walid_Siding_Contract.md",
      "utf8",
    );
    expect(contract).toContain("9A Regency Drive, Dartmouth");
    expect(contract).toContain("3-week");
    expect(contract).toContain("1-week");
    expect(contract).toContain("1,396.0 km");
    expect(contract).toContain("$1,005.12");
    expect(contract).toContain("$14,005.12");
    expect(contract).not.toMatch(/\$13,000\.00/);
  });

  it("clean presentation has no Manus/AI/draft banners and reflects scaled contract", () => {
    const index = readFileSync("presentations/walid/clean/index.html", "utf8");
    expect(index.toLowerCase()).not.toContain("manus");
    expect(index).not.toContain("__manus__");
    expect(existsSync("presentations/walid/clean/__manus__")).toBe(false);
    expect(existsSync("presentations/walid/MANUS_DELIVERY_NOTES.md")).toBe(false);

    const js = readFileSync("presentations/walid/clean/assets/index-CXbBCC-C.js", "utf8");
    expect(js.toLowerCase()).not.toContain("manus");
    expect(js).not.toMatch(/qualified Nova Scotia lawyer/i);
    expect(js).not.toMatch(/I'm an AI/i);
    expect(js).not.toMatch(/WORKING DRAFT/i);
    expect(js).toContain('base:"/presentations/walid/view"');
    expect(js).toContain("$14,005.12");
    expect(js).toContain("walid_system_01_cedar-datum.png");
  });
});
