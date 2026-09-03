import { describe, expect, it } from "vitest";
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

  it("includes every package folder deliverable", () => {
    const paths = new Set(manifest.files.map((f) => f.path));
    const required = [
      "00_README.md",
      "01_Model/Walid_3D_Viewer.html",
      "01_Model/walid_warehouse.glb",
      "01_Model/walid_warehouse.jscad.js",
      "01_Model/walid_warehouse.3mf",
      "01_Model/walid_warehouse.obj",
      "01_Model/walid_warehouse.mtl",
      "01_Model/walid_warehouse.stl",
      "01_Model/model_validation.md",
      "02_Plans_and_Takeoff/walid_facade_elevations.svg",
      "02_Plans_and_Takeoff/walid_facade_elevations.png",
      "02_Plans_and_Takeoff/walid_facade_elevations.dxf",
      "02_Plans_and_Takeoff/walid_facade_takeoff.xlsx",
      "02_Plans_and_Takeoff/walid_facade_takeoff.csv",
      "02_Plans_and_Takeoff/walid_facade_quantity_basis.md",
      "02_Plans_and_Takeoff/walid_dimension_register.md",
      "02_Plans_and_Takeoff/facade_design_brief.md",
      "03_Contract/Walid_Siding_Contract_Draft.md",
      "03_Contract/Walid_Siding_Contract_Draft.docx",
      "03_Contract/Walid_Change_Order_Form.md",
      "03_Contract/Walid_Change_Order_Form.docx",
      "03_Contract/Walid_Field_Measurement_and_Layout_Approval.md",
      "03_Contract/Walid_Field_Measurement_and_Layout_Approval.docx",
      "03_Contract/Walid_Substantial_Performance_and_Deficiency_Form.md",
      "03_Contract/Walid_Substantial_Performance_and_Deficiency_Form.docx",
      "04_Renderings/birdseye_view.webp",
      "04_Renderings/front_entrance_view.webp",
      "04_Renderings/garage_facade_view.webp",
      "04_Renderings/left_side_view.webp",
    ];
    for (const r of required) {
      expect(paths.has(r), `missing ${r}`).toBe(true);
    }
    expect(manifest.files.length).toBe(29);
  });
});
