import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import {
  PRESENTATIONS_ROOT,
  isValidPresentationSlug,
  presentationCookieName,
  presentationUnlocked,
  readPresentationMeta,
} from "@/lib/presentations";

type RouteParams = { params: Promise<{ slug: string; path?: string[] }> };

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
  ".obj": "text/plain; charset=utf-8",
  ".mtl": "text/plain; charset=utf-8",
  ".stl": "model/stl",
  ".3mf": "model/3mf",
  ".dxf": "application/dxf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug, path: parts = [] } = await params;
  if (!isValidPresentationSlug(slug)) {
    return NextResponse.json({ error: "Invalid presentation" }, { status: 400 });
  }

  const meta = await readPresentationMeta(slug);
  if (!meta) {
    return NextResponse.json({ error: "Presentation not found" }, { status: 404 });
  }

  const cookie = request.cookies.get(presentationCookieName(slug))?.value;
  if (!presentationUnlocked(cookie, meta)) {
    return NextResponse.redirect(new URL(`/presentations/${slug}`, request.url));
  }

  const relative =
    parts.length === 0
      ? "index.html"
      : parts.map(decodeURIComponent).join("/");

  if (
    relative.includes("..") ||
    relative.split("/").some((p) => p.startsWith(".")) ||
    relative.startsWith("__manus__")
  ) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const root = path.join(PRESENTATIONS_ROOT, slug, "clean");
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

    // Ensure relative asset paths resolve under /presentations/{slug}/view/
    // and normalize /index.html → / so the Manus (wouter) router matches path:"/".
    if (ext === ".html") {
      let html = buffer.toString("utf8");
      const base = `/presentations/${slug}/view/`;
      if (!/<base\s/i.test(html)) {
        html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${base}" />`);
      }
      if (!html.includes("data-bhc-view-normalize")) {
        const normalize = `<script data-bhc-view-normalize>(function(){var p=location.pathname;if(/\\/index\\.html$/i.test(p)){history.replaceState(null,"",p.replace(/\\/index\\.html$/i,"/")+location.search+location.hash);}})();</script>`;
        html = html.replace(/<head([^>]*)>/i, `<head$1>${normalize}`);
      }
      buffer = Buffer.from(html, "utf8");
    }

    const disposition = /\.(html?|png|jpe?g|webp|svg|pdf|css|js)$/i.test(fileName)
      ? "inline"
      : "attachment";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${fileName}"`,
        "Cache-Control": "private, max-age=300",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
