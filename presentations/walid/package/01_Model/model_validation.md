# Walid Warehouse 3D Model — Validation Record

## Automated Geometry Checks

| Check | Result |
| --- | ---: |
| JSCAD source compilation | Passed |
| OBJ export | Passed |
| STL export | Passed |
| 3MF export | Passed |
| GLB conversion (OBJ Z-up → glTF Y-up) | Passed |
| Model/site extents | Approx. 20.4 m × 15.2 m × 9.8 m including terrain apron, driveway strip, and roof |

## As-built corrections (site photo, Sep 2026)

| Item | Previous model | Corrected model |
| --- | --- | --- |
| Lower man door | On garage/back wall beside the sectional doors | On the **left sidewall**, near the garage-end corner |
| Side grade | Nine stepped terrain boxes (read as outdoor stairs) | Continuous sloping grade + left-side **driveway** apron |

Source photo: `06_Site_Photos/site_corner_man_door_sidewall.png` (OSB shell — man-door opening on sidewall; gravel slope, no stairs).

## Browser Presentation Checks

| View | Result |
| --- | --- |
| Default bird's-eye | Building upright; continuous slope from upper entrance grade down to garage threshold; driveway strip along left side. |
| Front entrance | Paired glazed entrance, cedar portal, adjacent sectional opening, square windows, charcoal field, lighting markers. |
| Garage/shop façade | Three sectional doors at lower grade; **no** man door on this wall; cedar header band and charcoal upper field. |
| Left side | Man door at lower grade near garage corner; continuous driveway slope (not stairs). |
| Camera controls | Preset buttons and drag/zoom interaction work in the browser viewer. |

## Known Model Limitations

The current model is an exterior coordination model. Openings are represented as applied glazed/door assemblies on the shell rather than as fully boolean-cut interior openings. Terrain and driveway are a visual approximation based on site photographs, not a survey surface. Cladding ribs, wood board lines, sconces, and framing are simplified for reliable browser rendering and quantity-zone communication.


## Grade revision (Manus fixed)

Driveway grade is offset 0.45 m from the side finish plane with a low landing at the downhill man door so the conceptual grade does not cover the lower side windows or door leaf. Field-verify before construction.
