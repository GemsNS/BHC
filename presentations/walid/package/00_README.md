# BH Contracting Ltd. — Walid Warehouse Project Package

**Project:** Warehouse Extension, 9 Alicia Scott Ave., Mount Uniacke, Nova Scotia B0N 1Z0  
**Prepared for:** BH Contracting Ltd.  
**Confirmed company email:** info@bhcontracting.ca  
**Package status:** Project model, quantities, and contract documents

## Package Overview

This package reconstructs the warehouse exterior from the supplied issued-for-permit drawings, construction photographs, and façade reference boards. It provides an editable parametric 3D source, common 3D exchange files, a single-file interactive viewer, concept elevations, a preliminary siding takeoff, and a four-document contract-administration set.

| Deliverable | Recommended file | Purpose |
| --- | --- | --- |
| Easiest interactive review | `01_Model/Walid_3D_Viewer.html` | Double-click to orbit, zoom, and switch among front, garage, side, and bird’s-eye cameras. Internet access is needed only to load the viewer component; the model geometry is embedded in the file. |
| Editable parametric model | `01_Model/walid_warehouse.jscad.js` | Change named dimensions and visibility options in a free browser-based CAD environment. |
| Color 3D exchange | `01_Model/walid_warehouse.3mf` or `.glb` | Import into compatible 3D/CAD/DCC or review software. |
| General mesh exchange | `01_Model/walid_warehouse.obj` plus `.mtl` | Transfer model and material assignments to compatible applications. Keep the two files together. |
| Basic mesh/fabrication reference | `01_Model/walid_warehouse.stl` | Widely compatible geometry-only format; colour is not preserved. |
| Concept elevation sheet | `02_Plans/walid_facade_elevations.svg` and `.png` | Review dimensions, opening patterns, finish zoning, and grade concept. |
| Editable CAD elevation linework | `02_Plans/walid_facade_elevations.dxf` | Open in compatible CAD software for further drafting and annotation. |
| Quantity workbook | `02_Plans/walid_facade_takeoff.xlsx` | Review preliminary gross, opening-deduction, net, and finish-allocation quantities. |
| Main agreement | `03_Contract/Walid_Siding_Contract.docx` | Trade agreement for the 30-square siding and two-door scope. |
| Contract controls | Three additional `.docx` forms in `03_Contract` | Document field measurement/layout approval, change orders, and substantial performance/deficiencies. |

## How to Edit the Model for Free

JSCAD is open-source and runs in current web browsers. Its official workflow supports loading a JavaScript design file in the browser and exporting common formats such as STL, OBJ, DXF, SVG, X3D, AMF, and 3MF.[1]

1. Open [JSCAD](https://openjscad.xyz/v2/).
2. Drag `walid_warehouse.jscad.js` into the modeling window, or paste the file’s contents into the editor.
3. Use the generated parameter controls to adjust the gable width, side depth, lower-level height, floor zone, upper-wall height, ridge rise, roof overhang, site visibility, accent visibility, cladding profile, and lighting markers.
4. Press **Ctrl+R** if the model does not render automatically.
5. Choose an export format in the JSCAD interface and export the revised geometry. The source was also compiled successfully with the official command-line workflow.[2]

> Keep `walid_warehouse.jscad.js` as the model of record for revisions. Mesh formats such as STL and OBJ are outputs and are harder to edit parametrically.

## Model-Control Dimensions

| Parameter | Current model value | Source/qualification |
| --- | ---: | --- |
| Gable/front-back width | 15.42 m | Written overall dimension on ground-level plan |
| Side-wall depth | 12.38 m | Written overall dimension on ground-level plan |
| Lower level | 3.91 m | Written section dimension |
| Floor/joist zone | 0.35 m | Written section dimension |
| Upper wall to eave | 2.75 m | Written section dimension |
| Eave to ridge | 2.11 m | Written section dimension |
| Overall slab to ridge | 9.12 m | Sum of the written vertical stack |
| Roof intent | 3:12 | Permit detail note; model uses the written ridge-rise dimension |
| Grade and retaining condition | Approximate | Reconstructed from the supplied field photographs, not a survey |

## Preliminary Quantity Basis

The modeled exposed façade is approximately **259.8 m² / 2,796 ft² / 28.0 squares net** after the modeled opening deductions. Applying a preliminary 10% coverage/waste allowance produces **approximately 30.8 squares**. This is close to the provisional 30-square job note, but it must not be used as a purchase order without field measurement and product-specific coverage checks.

| Finish allocation | Approximate net area | Approximate squares |
| --- | ---: | ---: |
| Cedar-tone accent | 105.2 m² / 1,132 ft² | 11.3 |
| Charcoal field | 154.6 m² / 1,664 ft² | 16.6 |
| **Combined net** | **259.8 m² / 2,796 ft²** | **28.0** |
| **Combined with 10% allowance** | **285.7 m² / 3,076 ft²** | **30.8** |

The side-wall quantity is sensitive to the actual grade line. Measure every visible wall segment and opening, then confirm laps, coverage, starter strips, corners, trims, flashing, break metal, damaged material, and waste before finalizing an order or fixed quantity.

## Contract Review Checklist

The main contract uses the provisional calculation of **30 squares × $400 + two doors × $500 = $13,000 before HST**. Before signature, the Parties should complete every blank and responsibility selection in Schedules A and B, especially the following items.

| Confirmation required | Why it matters |
| --- | --- |
| Legal/registered addresses and signatory titles | Identifies who is legally bound. |
| HST number and whether the $13,000 price is before or after HST | Prevents a tax and total-price dispute. |
| Whether BH Contracting supplies siding, cedar-tone product, trim, membrane, insulation, strapping, fasteners, sealant, lifts, scaffold, and disposal | These items materially change cost and responsibility. |
| Exact identity, specification, and supply responsibility for the two doors | The provisional $500-per-door line is written as installation unless changed. |
| Final field-measured quantity and façade layout | Controls the $400-per-square adjustment mechanism. |
| Start date, target completion date, site hours, and access | Controls scheduling and delay responsibility. |
| General contractor/constructor and authorized change-order representative | Controls site safety coordination and valid direction. |
| Insurance certificates and WCB clearance, if applicable | Confirms project compliance and risk allocation. |
| Approved contract payment schedule and holdback administration | Applies the Nova Scotia statutory 10% holdback framework.[3] |

## Field Verification Notes

Openings are represented as coordination assemblies on the exterior shell. The grade surface is approximate. Cladding profiles, accent returns, flashings, trim, soffits, lights, fasteners, membranes, insulation, and interfaces are simplified for coordination. Verify dimensions and rough openings in the field before ordering materials or commencing installation.

## References

[1]: https://openjscad.xyz/ "JSCAD — browser-based parametric CAD and supported formats"
[2]: https://github.com/jscad/OpenJSCAD.org/blob/master/packages/cli/README.md "JSCAD command-line interface usage"
[3]: https://canlii.ca/t/52zbh "Nova Scotia Builders’ Lien Act, RSNS 1989, c 277, section 13"
