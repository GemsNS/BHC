# Walid Warehouse — Standalone Two-Tone Model

Prepared for BH Contracting Ltd.

This package contains only the standalone 3D model requested for the Walid warehouse. The building envelope, roof geometry, measurements, door locations, window locations, and corrected driveway-side clearance are preserved from the geometry-locked source.

The finish system is a two-tone Mitten package: **Manor Grey board-and-batten** and **Mitten Burnt Sienna horizontal wood-grain siding**.

- **Upper entrance (front):** Oreo banding set out from the window line. Manor Grey base row below the window sills, a full-width Burnt Sienna wood-grain middle row that runs from below the sills up past the window heads to the eave (wood shows above and below the windows), and a Manor Grey gable above.
- **Garage face:** Burnt Sienna on the lower field up to the upper floor line (the garage-door level), Manor Grey on the upper field and gable.
- **Driveway / man-door side:** Manor Grey on the lower field up to the upper floor line, Burnt Sienna on the upper field.
- **Opposite side:** entirely Manor Grey.

Black frames and trim, glazing, concrete, terrain, and driveway are separate supporting materials.

Open `viewer.html` through a static server for the interactive textured model. The browser-ready file is `walid_warehouse_two_tone.glb`. Editable and exchange files are `walid_warehouse_two_tone.jscad.js`, `walid_warehouse_two_tone.3mf`, `walid_warehouse_two_tone.obj` with `walid_warehouse_two_tone.mtl`, and `walid_warehouse_two_tone.stl`.

The GLB contains embedded colour groups for Burnt Sienna, Manor Grey, Manor shadow, glazing, black trim, doors, concrete, terrain, driveway, and warm light. `walid_warehouse_two_tone_stats.json` records the final mesh and material validation. Digital colours are approximate; confirm physical product samples and field grade before ordering or installation.

## Local preview

```bash
PORT=4188 node serve_viewer.js
```

(or `PORT=4188 python3 serve_viewer.py`). Then open `http://localhost:4188/viewer.html`.

## Rebuilding the exports

Edit `walid_warehouse_two_tone.jscad.js`, then export with the JSCAD CLI and rebuild the GLB / OBJ / stats:

```bash
npx @jscad/cli@2 walid_warehouse_two_tone.jscad.js -of 3mf  -o walid_warehouse_two_tone.3mf
npx @jscad/cli@2 walid_warehouse_two_tone.jscad.js -of stlb -o walid_warehouse_two_tone.stl
node convert_model.js
```

`convert_model.js` needs only Node. `convert_model.py` is the original Python/trimesh version of the GLB step.
