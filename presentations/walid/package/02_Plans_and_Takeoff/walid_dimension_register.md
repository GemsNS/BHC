# Walid Warehouse Extension — Dimension Register

> **Use note:** This register records written dimensions visible in the permit set. It does not authorize construction, replace the architect’s drawings, or remove the contractor’s obligation to verify site conditions and rough openings.

## Source Sheets Reviewed

| Source | Sheet | Scale | Status |
| --- | --- | --- | --- |
| `Walidwarehouseextention-22May2026.pdf`, PDF page 5 | A.02.1 Basement Plan | 1:50 | Issued for Permit |
| `Walidwarehouseextention-22May2026.pdf`, PDF page 6 | A.02.2 Ground Level | 1:50 | Issued for Permit |

## Overall Geometry

| Parameter | Written dimension | Model interpretation |
| --- | ---: | ---: |
| Ground-level side-wall depth, grid 1–3 | **1,238 cm** | **12.38 m** |
| Ground-level gable/front-back width, grid A–D | **1,542 cm** | **15.42 m** |
| Basement width, grid 1–3 | **1,219 cm** | **12.19 m** |
| Basement principal length, grid A–D | Exterior dimension chain reads **25 + 291 + 12 + 163 + 12 + 989 + 48 cm** | **15.40 m** by summed chain; field/design verification required because this differs slightly from ground-level overall length. |
| Roof pitch | **3:12** | Rise/run ratio 0.25. |
| Vertical section stack | **391 + 35 + 275 + 211 cm** | Basement-to-grade/storey, floor zone, upper wall zone, and roof-rise segments as represented in the section; final datum assignment remains an explicit modeling assumption. |

## Ground-Level Exterior Openings

The ground level is a simple rectangular shell. The exterior opening pattern visible on sheet A.02.2 is summarized below.

| Elevation/grid line | Opening type | Written size or designation | Approximate placement description |
| --- | --- | --- | --- |
| Grid D wall | Two W-01 windows | W-01 schedule: **91 x 152 cm** | One near each end of the wall. |
| Grid A wall | Two W-01 windows plus one W-02 | W-01: **91 x 152 cm**; W-02: **122 x 122 cm** | W-01 near each end, W-02 centered. |
| Grid 1 side wall | Two W-02 windows | W-02: **122 x 122 cm** | One near upper/storage half and one near lower/office half. |
| Grid 3 side wall | Two W-02 windows, one GD01 line, D04, D03 double door, and another D04 | W-02: **122 x 122 cm**; D03 schedule: **183 x 203 cm** | Mixed openings arranged along the long side at storage and reception/entry zones. |

## Basement Exterior Openings

| Elevation/grid line | Opening type | Written size or designation | Placement description |
| --- | --- | --- | --- |
| Grid 1 wall | GD01, GD02, GD01 plus D04 at each outer end | GD01 schedule: **274 x 244 cm**; GD02 schedule: **373 x 244 cm**; D04: **91 x 203 cm** | Three large shop/garage openings form the principal lower-level façade. |
| Grid D wall | Two W-03 windows and one D04 | W-03 schedule: **142 x 57 cm** | High horizontal windows with a man door at the outer end. |
| Grid A wall | Two W-03 windows and one D04 | W-03 schedule: **142 x 57 cm** | High horizontal windows with a man door at the outer end. |
| Grid 3 wall | One W-02, two W-03, and a D02 entry to the washroom zone | W-02: **122 x 122 cm**; W-03: **142 x 57 cm** | Openings occur above/along the stepped retaining-wall side. |

## Ground-Level Internal Dimension Chains Useful for Positioning

| Chain/location | Written values |
| --- | --- |
| Grid D horizontal chain | **25 + 107 + 975 + 107 + 25 cm = 1,239 cm**; sheet overall is shown as 1,238 cm, indicating a 1 cm graphic/dimension discrepancy to flag. |
| Ground-level grid A internal room chain | **25 + 362 + 12 + 437 + 12 + 366 + 25 cm = 1,239 cm**; again 1 cm above the overall 1,238 cm. |
| Ground-level grid A–D side chain | Overall shown as **1,542 cm**. |
| Basement width split | **610 + 610 cm** beneath overall **1,219 cm**, another 1 cm nominal discrepancy. |

## Model-Control Decision

The parametric 3D model will use a **15.42 m gable/front-back width x 12.38 m side-wall depth** above-grade footprint because these are the clear written overall dimensions on A.02.2. The basement shell will use **12.19 m x 15.40 m** as a provisional geometry derived from A.02.1. Differences of approximately 10–20 mm in dimension chains will be treated as drawing-rounding discrepancies, not silently altered field dimensions.

## Elevation Composition Observations

Source sheets: A.03.1 Elevation Back and A.03.2 Elevation Face.

| Elevation | Verified drawing content | Modeling treatment |
| --- | --- | --- |
| Back / lower shop façade | One D04 man door at the far left and three sectional garage doors. The drawing labels the three façade bays approximately **488 cm, 549 cm, and 488 cm** across the grid intervals. Two high horizontal windows occur in the upper wall, one over each outer bay. | Model three garage doors using schedule widths **2.74 m, 3.73 m, and 2.74 m** within those bays, plus the 0.91 m man door. Use the bay dimensions to distribute openings rather than treating the 488/549/488 labels as door widths. |
| Front / principal upper entrance façade | A paired entrance door sits below a projecting rectangular canopy/feature frame. One sectional garage-style opening is to the right of the entrance. A W-02-type square window appears near each outer side. | Retain the entrance/canopy as a distinct façade feature and use it as the principal wood-look accent zone. Model the right-side sectional opening and flanking square windows from the permit geometry, then apply the new finish palette independently. |
| Roof profile | Both front and back show a symmetrical gable with moderate overhang. | Use the written **3:12** pitch and a provisional **0.45 m** overhang until a written overhang dimension is confirmed. |

The elevation sheets do not provide a complete exterior material key for the user’s new charcoal-and-wood design. The finish mapping will therefore be documented as a design assumption based on the two supplied reference boards rather than represented as an architect-approved permit revision.

## Side-Elevation Observations

Source sheets: A.03.3 Elevation Left and A.03.4 Elevation Right.

| Elevation | Verified drawing content | Modeling treatment |
| --- | --- | --- |
| Left side | One lower-level D04 man door near the shop/garage end; two W-03 high horizontal basement windows around the middle; one W-02 square upper-level window near the middle; W-01 tall windows near both upper corners. The elevation drawing itself presents a level baseline, while the site photos show substantial sloping grade. | Model all scheduled openings and use a separate site/grade mesh so the building geometry remains traceable to the permit set while the exposed foundation follows the photographed slope. |
| Right side | Two W-03 high horizontal basement windows, two upper W-01 tall windows near the corners, and no lower man door visible on this elevation. | Keep the opposing side simpler, with the same upper charcoal/wood finish logic but without inventing an unshown lower door. |

The field photos show that the actual site grade exposes much more of the lower level along portions of the side walls than the clean permit elevations communicate. For presentation views, the model will include a stepped/sloped ground surface as a **site-condition approximation**, clearly separated from the permit-derived building shell.

## Vertical Datums From Section A.04.1

The high-resolution section confirms the written stack as follows:

| Segment | Written dimension | Model datum interpretation |
| --- | ---: | --- |
| Basement slab/foundation level to underside/transition at upper floor | **391 cm** | Lower level shell height: **3.91 m**. |
| Floor/joist structural zone | **35 cm** | Inter-floor zone: **0.35 m**. |
| Upper-level wall to eave/bearing level | **275 cm** | Upper wall/eave height above finished upper floor: **2.75 m**. |
| Eave/bearing level to ridge | **211 cm** | Gable rise: **2.11 m**. |
| Total slab-to-ridge stack | **912 cm** | Provisional overall structural height: **9.12 m**, excluding any additional roof finish thickness and local grade variation. |

The gable is shown across the **15.42 m A–D dimension**, not across the 12.38 m side-wall depth. A 3:12 roof over a 7.71 m half-span rises approximately **1.93 m** before overhang; the section’s **2.11 m** eave-to-ridge callout is therefore broadly consistent once the roof projection and finish thickness are considered. The model will use the written **2.11 m ridge rise** and a proportional overhang close to the permit appearance.
