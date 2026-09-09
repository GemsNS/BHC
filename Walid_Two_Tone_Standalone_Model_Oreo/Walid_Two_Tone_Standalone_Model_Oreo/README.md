# Walid Warehouse — Standalone Two-Tone Model

Prepared for BH Contracting Ltd.

This package contains only the standalone 3D model requested for the Walid warehouse. The building envelope, roof geometry, measurements, door locations, window locations, and corrected driveway-side clearance are preserved from the geometry-locked source.

The finish system is **Mitten Burnt Sienna horizontal wood-grain siding on the upper field** and **Manor Grey board-and-batten on the lower field**. The downhill driveway/man-door side follows the same two-tone split. The opposite side is entirely Manor Grey. Black frames and trim, glazing, concrete, terrain, and driveway are separate supporting materials.

Open `viewer.html` through a static server for the interactive textured model. The browser-ready file is `walid_warehouse_two_tone.glb`. Editable and exchange files are `walid_warehouse_two_tone.jscad.js`, `walid_warehouse_two_tone.3mf`, `walid_warehouse_two_tone.obj` with `walid_warehouse_two_tone.mtl`, and `walid_warehouse_two_tone.stl`.

The GLB contains embedded colour groups for Burnt Sienna, Manor Grey, Manor shadow, glazing, black trim, doors, concrete, terrain, driveway, and warm light. `walid_warehouse_two_tone_stats.json` records the final mesh and material validation. Digital colours are approximate; confirm physical product samples and field grade before ordering or installation.

## Local preview

```bash
PORT=4188 python3 serve_viewer.py
```

Then open `http://localhost:4188/viewer.html`.
