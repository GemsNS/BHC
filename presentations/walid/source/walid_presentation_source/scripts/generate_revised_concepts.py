#!/usr/bin/env python3
"""Generate revised customer boards from the verified Walid elevation geometry."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

BASE = Path('/home/ubuntu/bh_contracting_project/design_options/generate_concept_boards.py')
OUT = Path('/home/ubuntu/webdev-static-assets/walid-revised-concepts')
OUT.mkdir(parents=True, exist_ok=True)

spec = spec_from_file_location('verified_board_generator', BASE)
module = module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)
module.OUT = OUT

# The source model fixes black vertical board-and-batten and wood-grain horizontal siding.
module.CONCEPTS = [
    module.Concept(
        'board-batten-ash', '05', 'Board + Ash',
        'A crisp black field with a quiet ash-toned horizontal datum.',
        '#343A40', '#22272C', '#B4A494', '#88786A', '#171A1D', '#7E8587',
        'Keep the vertical board-and-batten field continuous. Use a pale ash wood-grain band at the upper entrance, garage header, and side transition for a precise commercial rhythm.',
        'Moderate', 'Light accent is calm and easy to coordinate; confirm stain or printed-metal sample.',
    ),
    module.Concept(
        'harbour-iron', '06', 'Harbour Iron',
        'A salt-air industrial palette with iron siding and smoked oak accents.',
        '#252F35', '#171F24', '#80624B', '#5A4333', '#101518', '#A1A6A6',
        'Use a deep iron vertical board-and-batten shell with a restrained smoked-oak horizontal portal. A narrow copper-brown fascia line makes the roof profile legible without turning decorative.',
        'Moderate', 'Most restrained wood area; darker finish requires careful dust and runoff review.',
    ),
    module.Concept(
        'prairie-limestone', '07', 'Prairie Limestone',
        'A lighter road-facing option with graphite battens and limestone-toned wood grain.',
        '#596267', '#3D464B', '#B9AA96', '#8B7E6D', '#252B2F', '#D1D0C9',
        'Reverse the emphasis without changing the rule: a lighter vertical board-and-batten field carries daylight, while limestone-toned horizontal wood grain frames the entrance and anchors the garage elevation.',
        'Moderate–High', 'Bright surfaces read cleanly from the road but need runoff, sealant, and product-availability confirmation.',
    ),
]

for concept in module.CONCEPTS:
    module.create_board(concept)
    print(f'generated {concept.slug}')
