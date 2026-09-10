import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import {
  PRESENTATIONS_ROOT,
  isValidPresentationSlug,
} from "@/lib/presentations";

type RouteParams = { params: Promise<{ slug: string; path?: string[] }> };

/** Public (no password) assets under presentations/{slug}/v3/ */
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".obj": "text/plain; charset=utf-8",
  ".mtl": "text/plain; charset=utf-8",
  ".stl": "model/stl",
  ".3mf": "model/3mf",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { slug, path: parts = [] } = await params;
  if (!isValidPresentationSlug(slug)) {
    return NextResponse.json({ error: "Invalid presentation" }, { status: 400 });
  }

  const relative =
    parts.length === 0 ? "index.html" : parts.map(decodeURIComponent).join("/");

  if (
    relative.includes("..") ||
    relative.split("/").some((p) => p.startsWith(".")) ||
    relative.startsWith("__")
  ) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const root = path.join(PRESENTATIONS_ROOT, slug, "v3");
  const full = path.join(root, relative);
  if (!full.startsWith(root + path.sep) && full !== root) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const info = await stat(full);
    if (!info.isFile()) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    let buffer = await readFile(full);
    const ext = path.extname(full).toLowerCase();
    const fileName = path.basename(full);

    if (ext === ".html") {
      let html = buffer.toString("utf8");
      const base = `/presentations/${slug}/v3/`;
      if (!/<base\s/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${base}" />`);
      }
      buffer = Buffer.from(html, "utf8");
    }

    const disposition = /\.(html?|png|jpe?g|webp|svg|pdf|css|js|glb|gltf)$/i.test(fileName)
      ? "inline"
      : "attachment";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${fileName}"`,
        "Cache-Control": "public, max-age=300",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
