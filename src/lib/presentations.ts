import { createHash, timingSafeEqual } from "crypto";
import { readFile, stat } from "fs/promises";
import path from "path";

export const PRESENTATIONS_ROOT = path.join(process.cwd(), "presentations");

const COOKIE_PREFIX = "bhc-pres-";

export type PresentationMeta = {
  slug: string;
  title: string;
  customerName?: string;
  address?: string;
  email?: string;
  passwordSha256: string;
  notes?: string;
};

export type PresentationManifest = {
  title: string;
  project: string;
  preparedFor: string;
  email: string;
  packageStatus: string;
  files: Array<{ path: string; size: number; ext: string }>;
  zip: { path: string; size: number; ext: string };
  sections: Array<{
    id: string;
    title: string;
    md?: string | string[];
    dir?: string | null;
    viewer?: string;
    images?: string[];
  }>;
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json",
  ".js": "text/javascript; charset=utf-8",
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

export function isValidPresentationSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,48}$/i.test(slug);
}

export function presentationCookieName(slug: string): string {
  return `${COOKIE_PREFIX}${slug}`;
}

export function hashPresentationPassword(password: string): string {
  return createHash("sha256").update(password.trim()).digest("hex");
}

export function verifyPresentationPassword(
  password: string,
  expectedSha256: string,
): boolean {
  const got = Buffer.from(hashPresentationPassword(password), "utf8");
  const expected = Buffer.from(expectedSha256.trim().toLowerCase(), "utf8");
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

function presentationDir(slug: string): string {
  if (!isValidPresentationSlug(slug)) throw new Error("Invalid presentation slug");
  return path.join(PRESENTATIONS_ROOT, slug);
}

export async function readPresentationMeta(
  slug: string,
): Promise<PresentationMeta | null> {
  try {
    const raw = await readFile(path.join(presentationDir(slug), "meta.json"), "utf8");
    return JSON.parse(raw) as PresentationMeta;
  } catch {
    return null;
  }
}

export async function readPresentationManifest(
  slug: string,
): Promise<PresentationManifest | null> {
  try {
    const raw = await readFile(
      path.join(presentationDir(slug), "manifest.json"),
      "utf8",
    );
    return JSON.parse(raw) as PresentationManifest;
  } catch {
    return null;
  }
}

/** Resolve a file under package/ or the root zip — never escape the presentation dir. */
export async function readPresentationAsset(
  slug: string,
  relativePath: string,
): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
  if (!isValidPresentationSlug(slug)) return null;
  const cleaned = relativePath.replace(/^\/+/, "").replace(/\\/g, "/");
  if (
    !cleaned ||
    cleaned.includes("..") ||
    cleaned.startsWith(".") ||
    cleaned.split("/").some((p) => p.startsWith("."))
  ) {
    return null;
  }

  const root = presentationDir(slug);
  const candidates =
    cleaned === "BH_Contracting_Walid_Complete_Package.zip" ||
    cleaned.endsWith(".zip")
      ? [path.join(root, cleaned), path.join(root, "package", cleaned)]
      : [path.join(root, "package", cleaned), path.join(root, cleaned)];

  for (const full of candidates) {
    if (!full.startsWith(root + path.sep) && full !== root) continue;
    try {
      const info = await stat(full);
      if (!info.isFile()) continue;
      const buffer = await readFile(full);
      const fileName = path.basename(full);
      const ext = path.extname(fileName).toLowerCase();
      return {
        buffer,
        fileName,
        mimeType: MIME[ext] ?? "application/octet-stream",
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

export function presentationUnlocked(
  cookieValue: string | undefined,
  meta: PresentationMeta,
): boolean {
  if (!cookieValue) return false;
  // Cookie stores the password hash after successful unlock
  const a = Buffer.from(cookieValue.trim().toLowerCase(), "utf8");
  const b = Buffer.from(meta.passwordSha256.trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
