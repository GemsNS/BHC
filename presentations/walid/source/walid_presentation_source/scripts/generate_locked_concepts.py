#!/usr/bin/env python3
"""Reframe the user's official geometry-locked elevations as clean concept plates."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SOURCE = Path('/home/ubuntu/bhc_latest_source/presentations/walid/clean/project-assets')
OUTPUT = Path('/home/ubuntu/webdev-static-assets/walid-locked-concepts')
OUTPUT.mkdir(parents=True, exist_ok=True)

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
PAPER = '#F3F0E9'
INK = '#171B1F'
MUTED = '#61666A'
CEDAR = '#A86F3D'
LINE = '#D3CEC4'
WHITE = '#FFFFFF'


def font(size: int, bold: bool = False):
    return ImageFont.truetype(BOLD if bold else FONT, size)


def wrapped(draw: ImageDraw.ImageDraw, text: str, xy: tuple[int, int], width: int, size: int, fill: str, spacing: int = 8):
    words = text.split()
    lines, current = [], ''
    for word in words:
        trial = f'{current} {word}'.strip()
        if draw.textlength(trial, font=font(size)) <= width:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    x, y = xy
    for line in lines:
        draw.text((x, y), line, font=font(size), fill=fill)
        y += size + spacing
    return y


CONCEPTS = [
    {
        'number': '01', 'slug': 'cedar-datum', 'source': 'walid_concept_01_cedar-datum.png',
        'name': 'Cedar Datum', 'rule': 'Horizontal wood-grain bands organize the two levels.',
        'system': 'Black vertical board-and-batten remains the primary field. Horizontal wood-grain siding forms the entrance field, garage header/drop rhythm, and floor-transition datum. Black fascia keeps the roof edge quiet.',
        'difference': 'Continuous horizontal datum + concentrated wood feature fields',
        'fascia': 'Black folded-metal fascia and rake trim', 'cost': 'Moderate',
    },
    {
        'number': '02', 'slug': 'full-battens', 'source': 'walid_concept_02_full-battens.png',
        'name': 'Full Battens', 'rule': 'One vertical language gives the shell a disciplined industrial read.',
        'system': 'Black vertical board-and-batten covers all siding zones. Openings receive compact black folded-metal trim with no broad wood field. Fascia, rake, and soffit edges read as one continuous dark outline.',
        'difference': 'No wood field + uninterrupted vertical rhythm',
        'fascia': 'Continuous black fascia/rake with matching soffit edge', 'cost': 'Lower–Moderate',
    },
    {
        'number': '03', 'slug': 'split-storey', 'source': 'walid_concept_03_split-storey.png',
        'name': 'Split Storey', 'rule': 'The material break follows the building’s two-level organization.',
        'system': 'Horizontal wood-grain siding wraps the exposed lower storey. Black vertical board-and-batten begins at the floor/joist datum and continues through the upper walls and gables. A black flashing band makes the transition deliberate.',
        'difference': 'Full lower-storey wood wrap + upper vertical metal shell',
        'fascia': 'Black fascia with a crisp black inter-storey transition flashing', 'cost': 'Moderate–High',
    },
    {
        'number': '04', 'slug': 'framed-bays', 'source': 'walid_concept_04_framed-bays.png',
        'name': 'Framed Bays', 'rule': 'Wood-grain picture frames identify entrances and shop doors.',
        'system': 'Black vertical board-and-batten remains continuous between openings. Horizontal wood-grain siding forms framed surrounds at the main entrance and garage door group, creating distinct work bays without wrapping the entire lower level.',
        'difference': 'Opening-specific wood portals + continuous vertical background',
        'fascia': 'Black fascia/rake; wood is limited to portal frames below', 'cost': 'Moderate–High',
    },
]


generated = []

for item in CONCEPTS:
    source = Image.open(SOURCE / item['source']).convert('RGB')
    if item['slug'] == 'split-storey':
        # All source boards share the exact official elevation pixels.
        # Replace only the incomplete/glitched upper fields with the complete
        # Full Battens equivalent; retain the wood-grain lower garage storey.
        battens = Image.open(SOURCE / 'walid_concept_02_full-battens.png').convert('RGB')
        source.paste(battens.crop((70, 580, 830, 1045)), (70, 580))
        source.paste(battens.crop((835, 580, 1605, 855)), (835, 580))
    # Crop only the official elevation plate; all geometry and opening pixels stay unchanged.
    elevation = source.crop((70, 320, 1615, 1240))
    canvas = Image.new('RGB', (2000, 1125), PAPER)
    draw = ImageDraw.Draw(canvas)

    draw.rectangle((0, 0, 18, 1125), fill=CEDAR)
    draw.text((58, 34), 'BH CONTRACTING LTD.  /  WALID WAREHOUSE', font=font(18, True), fill=MUTED)
    draw.text((1940, 34), f"CONCEPT {item['number']}", font=font(18, True), fill=MUTED, anchor='ra')
    draw.text((58, 72), item['name'], font=font(42, True), fill=INK)
    draw.text((58, 124), item['rule'], font=font(20), fill=MUTED)
    draw.line((58, 165, 1940, 165), fill=LINE, width=2)

    image_box = (58, 205, 1415, 1015)
    draw.rectangle(image_box, fill=WHITE, outline=LINE, width=2)
    elevation.thumbnail((1310, 760), Image.Resampling.LANCZOS)
    canvas.paste(elevation, (82, 230))

    panel_x = 1460
    draw.rectangle((panel_x, 205, 1940, 1015), fill=WHITE, outline=LINE, width=2)
    draw.rectangle((panel_x, 205, panel_x + 10, 1015), fill=CEDAR)
    draw.text((panel_x + 42, 244), 'APPLICATION SYSTEM', font=font(18, True), fill=INK)
    y = wrapped(draw, item['system'], (panel_x + 42, 286), 410, 18, MUTED, 9)
    y += 30
    draw.text((panel_x + 42, y), 'WHAT CHANGES', font=font(15, True), fill=CEDAR)
    y = wrapped(draw, item['difference'], (panel_x + 42, y + 28), 410, 18, INK, 9)
    y += 28
    draw.text((panel_x + 42, y), 'FASCIA / EDGE', font=font(15, True), fill=CEDAR)
    y = wrapped(draw, item['fascia'], (panel_x + 42, y + 28), 410, 18, INK, 9)
    y += 28
    draw.text((panel_x + 42, y), 'RELATIVE COST', font=font(15, True), fill=CEDAR)
    draw.text((panel_x + 42, y + 30), item['cost'], font=font(22, True), fill=INK)

    draw.rectangle((58, 1038, 1940, 1088), fill=INK)
    draw.text((82, 1054), 'SIDING / FACADE / FASCIA APPLICATION ONLY', font=font(14, True), fill=WHITE)
    draw.text((1916, 1054), 'MEASUREMENTS, ROOF GEOMETRY AND ALL OPENINGS LOCKED', font=font(14, True), fill=WHITE, anchor='ra')

    output = OUTPUT / f"walid_system_{item['number']}_{item['slug']}.png"
    canvas.save(output, quality=94, optimize=True)
    generated.append(output)
    print(output)

contact = Image.new('RGB', (1600, 900), '#D8D2C7')
for index, path in enumerate(generated):
    board = Image.open(path).convert('RGB')
    board.thumbnail((790, 440), Image.Resampling.LANCZOS)
    x = 5 + (index % 2) * 800
    y = 5 + (index // 2) * 450
    contact.paste(board, (x, y))
contact_path = OUTPUT / 'walid_systems_contact_sheet.png'
contact.save(contact_path, quality=94, optimize=True)
print(contact_path)
