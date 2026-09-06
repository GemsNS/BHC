#!/usr/bin/env python3
"""Convert and validate the Walid warehouse OBJ model."""

from pathlib import Path
import json
import math
import trimesh

ROOT = Path(__file__).resolve().parent
OBJ = ROOT / "walid_warehouse.obj"
GLB = ROOT / "walid_warehouse.glb"
STATS = ROOT / "model_stats.json"

scene = trimesh.load(OBJ, force="scene", process=False)

if not isinstance(scene, trimesh.Scene):
    scene = trimesh.Scene(scene)

# OBJ/JSCAD geometry is Z-up. glTF viewers such as <model-viewer> are Y-up.
# Rotate -90 degrees about X so original Z becomes positive Y.
scene.apply_transform(trimesh.transformations.rotation_matrix(math.radians(-90.0), [1.0, 0.0, 0.0]))

bounds = scene.bounds
extents = scene.extents
geometry_count = len(scene.geometry)
triangle_count = 0
vertex_count = 0
watertight_count = 0

for geom in scene.geometry.values():
    triangle_count += int(len(geom.faces))
    vertex_count += int(len(geom.vertices))
    if bool(geom.is_watertight):
        watertight_count += 1

GLB.write_bytes(scene.export(file_type="glb"))

stats = {
    "source": OBJ.name,
    "glb": GLB.name,
    "geometry_count": geometry_count,
    "triangle_count": triangle_count,
    "vertex_count": vertex_count,
    "watertight_geometry_count": watertight_count,
    "bounds_min_m": [round(float(v), 4) for v in bounds[0]],
    "bounds_max_m": [round(float(v), 4) for v in bounds[1]],
    "extents_m": [round(float(v), 4) for v in extents],
}

STATS.write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
print(json.dumps(stats, indent=2))
