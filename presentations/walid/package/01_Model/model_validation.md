# Walid Warehouse 3D Model — Validation Record

## Automated Geometry Checks

| Check | Result |
| --- | ---: |
| JSCAD source compilation | Passed |
| OBJ export | Passed |
| STL export | Passed |
| 3MF export | Passed |
| GLB conversion | Passed |
| GLB geometry groups | 6 |
| GLB triangle count | 5,760 |
| GLB vertex count | 3,554 |
| Watertight geometry groups | 5 of 6; the non-watertight group consists of presentation/detail geometry and is acceptable for visualization but should not be treated as a fabrication solid. |
| Model/site extents | Approx. 20.22 m × 17.20 m × 9.81 m including terrain apron and roof thickness |

## Browser Presentation Checks

| View | Result |
| --- | --- |
| Default bird's-eye | Passed after correcting the OBJ Z-up to GLB Y-up axis conversion. Building stands upright, roof slopes correctly, and the sloped site is visible. |
| Front entrance | Passed. Paired glazed entrance, cedar portal, adjacent sectional opening, square windows, charcoal field, and lighting markers are visible. |
| Garage/shop façade | Passed after revising the terrain profile. Three sectional doors and the man door are visible at the lower-grade threshold, with the cedar header band and charcoal upper field. |
| Camera controls | Passed. Preset buttons and drag/zoom interaction work in the browser viewer. |

## Known Model Limitations

The current model is an exterior coordination model. Openings are represented as applied glazed/door assemblies on the shell rather than as fully boolean-cut interior openings. Terrain is a stepped visual approximation based on the site photographs, not a survey surface. Cladding ribs, wood board lines, sconces, and framing are simplified for reliable browser rendering and quantity-zone communication.

## Final Terrain Adjustment Check

After changing the grade interpolation to reach the lower slab datum at the garage façade, the rebuilt model was inspected again in the browser. The entrance side remains at upper-floor grade, the side terrain steps down progressively, and the garage-door thresholds are visible rather than buried. The garage preset clearly shows all three sectional doors, the outer man door, two upper horizontal windows, the charcoal gable field, the cedar header band, and the wall light markers.

## Final Elevation-Preset Checks

The **front entrance** preset shows the paired glazed entrance, cedar portal, right-side sectional door, two outer square windows, charcoal gable field, and upper-grade retaining condition. The **left side** preset shows the three upper window groups, two lower horizontal windows, cedar lower wall/transition band, and the stepped grade running from the upper entrance datum down toward the shop/garage façade. Both views passed the lightweight presentation check.
