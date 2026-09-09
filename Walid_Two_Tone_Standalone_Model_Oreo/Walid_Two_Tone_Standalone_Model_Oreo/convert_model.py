#!/usr/bin/env python3
"""Convert JSCAD 3MF to a colour-preserving browser-ready GLB."""
from collections import defaultdict
from pathlib import Path
import json
import math
import re
import xml.etree.ElementTree as ET
import zipfile
import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "walid_warehouse_two_tone.3mf"
GLB = ROOT / "walid_warehouse_two_tone.glb"
STATS = ROOT / "walid_warehouse_two_tone_stats.json"
COLOUR_NAMES = {
    (142,79,42,255): "burnt_sienna",
    (102,53,29,255): "burnt_sienna_joint",
    (37,40,43,255): "manor_grey",
    (23,25,27,255): "manor_shadow",
    (31,51,61,199): "glazing",
    (16,18,20,255): "black_trim",
    (119,123,125,255): "doors",
    (139,142,140,255): "concrete",
    (102,99,93,255): "terrain",
    (90,88,82,255): "driveway",
    (255,163,107,255): "warm_light",
}

def parse_colour(raw):
    if raw.upper().startswith("#1ECCD6"):
        return (31,51,61,199)
    match = re.match(r"#([0-9A-Fa-f]{8})", raw)
    if not match:
        raise ValueError(f"Unsupported 3MF colour: {raw}")
    value = match.group(1)
    return tuple(int(value[index:index+2], 16) for index in range(0, 8, 2))

with zipfile.ZipFile(SOURCE) as archive:
    root = ET.fromstring(archive.read("3D/3dmodel.model"))
materials = [parse_colour(base.attrib["displaycolor"]) for base in root.findall(".//basematerials/base")]
grouped_vertices = defaultdict(list)
grouped_faces = defaultdict(list)
offsets = defaultdict(int)
for obj in root.findall(".//resources/object"):
    colour = materials[int(obj.attrib.get("pindex", "0"))]
    vertices = np.array([[float(v.attrib[a]) for a in ("x","y","z")] for v in obj.findall(".//vertices/vertex")], dtype=float)
    faces = np.array([[int(t.attrib[a]) for a in ("v1","v2","v3")] for t in obj.findall(".//triangles/triangle")], dtype=int)
    if len(vertices) == 0 or len(faces) == 0:
        continue
    grouped_vertices[colour].append(vertices)
    grouped_faces[colour].append(faces + offsets[colour])
    offsets[colour] += len(vertices)
scene = trimesh.Scene()
rotation = trimesh.transformations.rotation_matrix(math.radians(-90.0), [1.0, 0.0, 0.0])
for index, colour in enumerate(sorted(grouped_vertices)):
    vertices = np.vstack(grouped_vertices[colour])
    faces = np.vstack(grouped_faces[colour])
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    mesh.visual = trimesh.visual.ColorVisuals(mesh=mesh, vertex_colors=np.tile(np.array(colour, dtype=np.uint8), (len(vertices), 1)))
    mesh.apply_transform(rotation)
    name = COLOUR_NAMES.get(colour, f"material_{index}_{colour[0]}_{colour[1]}_{colour[2]}")
    scene.add_geometry(mesh, geom_name=name, node_name=name)
GLB.write_bytes(scene.export(file_type="glb"))
stats = {
    "source": SOURCE.name,
    "glb": GLB.name,
    "geometry_count": len(scene.geometry),
    "triangle_count": int(sum(len(mesh.faces) for mesh in scene.geometry.values())),
    "vertex_count": int(sum(len(mesh.vertices) for mesh in scene.geometry.values())),
    "bounds_min_m": [round(float(v),4) for v in scene.bounds[0]],
    "bounds_max_m": [round(float(v),4) for v in scene.bounds[1]],
    "extents_m": [round(float(v),4) for v in scene.extents],
    "embedded_materials": [{"name": COLOUR_NAMES.get(c,"other"), "rgba": list(c)} for c in sorted(grouped_vertices)],
}
STATS.write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
print(json.dumps(stats, indent=2))
