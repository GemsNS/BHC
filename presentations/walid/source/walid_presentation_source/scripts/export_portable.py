#!/usr/bin/env python3
"""Assemble a portable static handoff from the revised production build."""

from __future__ import annotations

from pathlib import Path
import re
import shutil

PROJECT = Path(__file__).resolve().parents[1]
DIST = PROJECT / "dist" / "public"
OUTPUT = PROJECT / "private_web_package"


def parse_upload_log(path: Path) -> dict[str, Path]:
    mapping: dict[str, Path] = {}
    if not path.exists():
        return mapping
    pattern = re.compile(r"\[SUCCESS\]\s+(.+?)\s+->\s+(/manus-storage/\S+)")
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        match = pattern.search(line)
        if match:
            mapping[match.group(2)] = Path(match.group(1))
    return mapping


def main() -> None:
    if not DIST.exists():
        raise SystemExit("Production build missing. Run `pnpm build` first.")

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(DIST, OUTPUT)
    local_assets = OUTPUT / "project-assets"
    local_assets.mkdir(parents=True, exist_ok=True)

    mapping: dict[str, Path] = {}
    for log_name in ("revised_asset_uploads.log", "revised_concept_reuploads.log", "locked_asset_uploads.log", "completed_asset_uploads.log"):
        mapping.update(parse_upload_log(PROJECT / log_name))

    referenced_text = "\n".join(
        path.read_text(encoding="utf-8", errors="ignore")
        for path in DIST.rglob("*")
        if path.suffix in {".html", ".js", ".css"}
    )
    mapping = {url: source for url, source in mapping.items() if url in referenced_text}

    missing = [str(source) for source in mapping.values() if not source.exists()]
    if missing:
        raise SystemExit("Missing local assets:\n" + "\n".join(missing))

    replacement_names: dict[str, str] = {}
    used_names: set[str] = set()
    for storage_url, source in mapping.items():
        name = source.name
        if name in used_names:
            stem, suffix = source.stem, source.suffix
            counter = 2
            while f"{stem}_{counter}{suffix}" in used_names:
                counter += 1
            name = f"{stem}_{counter}{suffix}"
        used_names.add(name)
        shutil.copy2(source, local_assets / name)
        replacement_names[storage_url] = name

    for path in OUTPUT.rglob("*"):
        if path.suffix not in {".html", ".js", ".css"}:
            continue
        content = path.read_text(encoding="utf-8")
        if path.suffix == ".html":
            content = content.replace('src="/assets/', 'src="./assets/').replace('href="/assets/', 'href="./assets/')
            prefix = "./project-assets/"
        elif path.suffix == ".css":
            prefix = "../project-assets/"
        else:
            prefix = "./project-assets/"
        for storage_url, name in replacement_names.items():
            content = content.replace(storage_url, f"{prefix}{name}")
        path.write_text(content, encoding="utf-8")

    unresolved = []
    for path in OUTPUT.rglob("*"):
        if path.suffix in {".html", ".js", ".css"}:
            text = path.read_text(encoding="utf-8", errors="ignore")
            if "/manus-storage/" in text:
                unresolved.append(str(path.relative_to(OUTPUT)))
    if unresolved:
        raise SystemExit("Unresolved storage URLs remain in: " + ", ".join(unresolved))

    readme = """# BH Contracting — Walid Warehouse Private Presentation

This folder is a static, privately hostable one-page presentation built from the revised Walid project files. It contains four geometry-locked siding/facade/fascia application systems, a corrected continuous driveway slope offset from the wall openings, the downhill-side man-door landing, an interactive GLB model, verified site imagery, dimensions, concept elevations, takeoff, pricing basis, contract review, editable contract forms, permit PDF, DXF/SVG linework, spreadsheet, and 3D exchange files.

## Upload

Upload **all files and folders in this directory** to one directory on your private web server, preserving the `assets/` and `project-assets/` subfolders. Open `index.html`. The package uses relative paths and can be hosted at a domain root or inside a subdirectory.

Use HTTPS. Protect the directory with your host's password access, VPN, or private-link controls. The page includes `noindex`, but `noindex` is not access control.

## Local review

The interactive model requires the page to be served over HTTP rather than opened through `file://`. Any basic static server is sufficient. For example, from this directory run `npx serve .` and open the displayed local URL.

## Important qualifications

The model, renderings, takeoff, and concept elevations are for façade intent and coordination only. They are not permit, structural, engineering, shop, or sealed drawings. Field-verify dimensions, openings, grade, substrate, cladding limits, products, flashings, and quantities before ordering or construction. The contract is a working draft and should be reviewed by a qualified Nova Scotia lawyer before signature.
"""
    (OUTPUT / "README.md").write_text(readme, encoding="utf-8")

    file_count = sum(1 for path in OUTPUT.rglob("*") if path.is_file())
    total_bytes = sum(path.stat().st_size for path in OUTPUT.rglob("*") if path.is_file())
    print(f"Portable package: {OUTPUT}")
    print(f"Files: {file_count}")
    print(f"Size: {total_bytes / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
