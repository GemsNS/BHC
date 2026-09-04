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

  it("includes core package deliverables and Manus fixed design systems", () => {
    const paths = new Set(manifest.files.map((f) => f.path));
    const required = [
      "00_README.md",
      "01_Model/Walid_3D_Viewer.html",
      "01_Model/walid_warehouse.glb",
      "01_Model/walid_warehouse.jscad.js",
      "03_Contract/Walid_Siding_Contract.md",
      "03_Contract/Walid_Siding_Contract.docx",
      "05_Design_Options/walid_system_01_cedar-datum.png",
      "05_Design_Options/walid_system_02_full-battens.png",
      "05_Design_Options/walid_system_03_split-storey.png",
      "05_Design_Options/walid_system_04_framed-bays.png",
      "06_Site_Photos/site_existing_02.webp",
      "06_Site_Photos/site_existing_04.webp",
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

  it("clean Manus presentation is telemetry-free with locked systems and site hero", () => {
    const index = readFileSync("presentations/walid/clean/index.html", "utf8");
    expect(index.toLowerCase()).not.toContain("manus");
    expect(index).not.toContain("__manus__");
    expect(index).not.toContain("manus-analytics");
    expect(existsSync("presentations/walid/clean/__manus__")).toBe(false);

    const js = readFileSync("presentations/walid/clean/assets/index-CXbBCC-C.js", "utf8");
    expect(js).not.toMatch(/qualified Nova Scotia lawyer/i);
    expect(js).not.toMatch(/I'm an AI/i);
    expect(js).not.toMatch(/WORKING DRAFT/i);
    expect(js).not.toContain("Walid_Siding_Contract_Draft.docx");
    expect(js).toContain('base:"/presentations/walid/view"');
    expect(js).toContain("./project-assets/site_existing_04.webp");
    expect(js).not.toContain("site_existing_01.webp");
    expect(js).toContain("Cedar Datum");
    expect(js).toContain("Full Battens");
    expect(js).toContain("Split Storey");
    expect(js).toContain("Framed Bays");
    expect(js).toContain("walid_system_01_cedar-datum.png");
    expect(js).toContain("walid_system_02_full-battens.png");
    expect(js).toContain("walid_system_03_split-storey.png");
    expect(js).toContain("walid_system_04_framed-bays.png");

    expect(existsSync("presentations/walid/clean/project-assets/Walid_Siding_Contract.docx")).toBe(
      true,
    );
    expect(
      existsSync("presentations/walid/clean/project-assets/walid_warehouse.glb"),
    ).toBe(true);
    expect(
      existsSync("presentations/walid/source/Walid_Private_Web_Presentation_Materials_Fixed.zip"),
    ).toBe(true);
    expect(
      existsSync("presentations/walid/source/Walid_Presentation_Source_Materials_Fixed.zip"),
    ).toBe(true);
  });
});
