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

  it("includes core package deliverables and Manus design assets", () => {
    const paths = new Set(manifest.files.map((f) => f.path));
    const required = [
      "00_README.md",
      "01_Model/Walid_3D_Viewer.html",
      "01_Model/walid_warehouse.glb",
      "03_Contract/Walid_Siding_Contract.md",
      "03_Contract/Walid_Siding_Contract.docx",
      "04_Renderings/birdseye_view.webp",
      "05_Design_Options/walid_concept_01_cedar-datum.png",
      "05_Design_Options/walid_concept_02_full-battens.png",
      "05_Design_Options/walid_concept_03_split-storey.png",
      "05_Design_Options/walid_concept_04_framed-bays.png",
      "06_Site_Photos/site_existing_02.webp",
      "06_Site_Photos/site_corner_man_door_sidewall.png",
      "07_Permit/walid_permit_drawings.pdf",
    ];
    for (const r of required) {
      expect(paths.has(r), `missing ${r}`).toBe(true);
    }
    expect(paths.has("06_Site_Photos/site_existing_01.webp")).toBe(false);
    expect(paths.has("05_Design_Options/walid_concept_02_foundry-bronze.png")).toBe(false);
    expect(manifest.files.length).toBeGreaterThanOrEqual(45);
  });

  it("prices 3-week job + 1-week pushback fuel into the siding contract", () => {
    const contract = readFileSync(
      "presentations/walid/package/03_Contract/Walid_Siding_Contract.md",
      "utf8",
    );
    expect(contract).toContain("9A Regency Drive, Dartmouth");
    expect(contract).toContain("Mount Uniacke");
    expect(contract).toContain("3-week");
    expect(contract).toContain("1-week");
    expect(contract).toContain("20");
    expect(contract).toContain("1,396.0 km");
    expect(contract).toContain("$0.72");
    expect(contract).toContain("$1,005.12");
    expect(contract).toContain("$14,005.12");
    expect(contract).not.toMatch(/\*\*\$13,050\.26\*\*/);
    expect(contract).not.toMatch(/\*\*\$13,000\.00\*\*/);
  });

  it("clean Manus presentation keeps application concepts and scaled contract", () => {
    const index = readFileSync("presentations/walid/clean/index.html", "utf8");
    expect(index.toLowerCase()).not.toContain("manus");
    expect(index).not.toContain("__manus__");
    const js = readFileSync("presentations/walid/clean/assets/index-D1-IZERK.js", "utf8");
    expect(js).not.toMatch(/qualified Nova Scotia lawyer/i);
    expect(js).not.toMatch(/I'm an AI/i);
    expect(js).not.toMatch(/WORKING DRAFT/i);
    expect(js).not.toContain("Walid_Siding_Contract_Draft.docx");
    expect(js).toContain('base:"/presentations/walid/view"');
    expect(js).toContain('hero:"./project-assets/front_entrance_view.webp"');
    expect(js).toContain("CONCEPT MODEL RENDER / NOT A SITE PHOTO");
    expect(js).not.toContain("site_existing_01.webp");
    expect(js).toContain("Cedar Datum");
    expect(js).toContain("Full Battens");
    expect(js).toContain("Split Storey");
    expect(js).toContain("Framed Bays");
    expect(js).toContain("walid_concept_01_cedar-datum.png");
    expect(js).toContain("walid_concept_02_full-battens.png");
    expect(js).toContain("walid_concept_03_split-storey.png");
    expect(js).toContain("walid_concept_04_framed-bays.png");
    expect(js).not.toContain("foundry-bronze");
    expect(js).not.toContain("coastal-zinc");
    expect(js).not.toContain("night-cedar");
    expect(js).toContain("contract-full-embed");
    expect(js).toContain("Walid_Siding_Contract.embed.html");
    expect(js).toContain("$14,005.12");
    expect(existsSync("presentations/walid/clean/project-assets/Walid_Siding_Contract.docx")).toBe(
      true,
    );
    expect(
      existsSync("presentations/walid/clean/project-assets/Walid_Siding_Contract_Draft.docx"),
    ).toBe(false);
  });
});
