#!/usr/bin/env python3
"""Verify that the browser-ready GLB contains embedded colour groups."""

from collections import Counter
from pathlib import Path

import trimesh

path = Path(__file__).with_name('walid_warehouse.glb')
scene = trimesh.load(path, force='scene', process=False)
colours: Counter[tuple[int, int, int, int]] = Counter()

for name, geometry in scene.geometry.items():
    print(f'geometry={name} visual={type(geometry.visual).__name__} kind={getattr(geometry.visual, "kind", None)}')
    vertex_colours = getattr(geometry.visual, 'vertex_colors', None)
    if vertex_colours is not None:
        print(f'  vertex_colours={getattr(vertex_colours, "shape", None)}')
        for colour in vertex_colours:
            colours[tuple(int(value) for value in colour)] += 1
    face_colours = getattr(geometry.visual, 'face_colors', None)
    if face_colours is not None:
        print(f'  face_colours={getattr(face_colours, "shape", None)}')
        for colour in face_colours:
            colours[tuple(int(value) for value in colour)] += 1
    material = getattr(geometry.visual, 'material', None)
    if material is not None:
        factor = getattr(material, 'baseColorFactor', None)
        print(f'  material={getattr(material, "name", None)} base={factor}')
        if factor is not None:
            colours[tuple(int(round(float(value) * 255 if float(value) <= 1 else float(value))) for value in factor)] += 1

meaningful = [(colour, count) for colour, count in colours.most_common() if colour[3] > 0]
print(f'geometry_count={len(scene.geometry)}')
print(f'unique_embedded_colours={len(meaningful)}')
for colour, count in meaningful[:12]:
    print(f'rgba={colour} vertices={count}')

if len(meaningful) < 5:
    raise SystemExit('FAIL: insufficient embedded material colours')
print('PASS: complete embedded material palette detected')
