import { mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { AppData } from "./types";

/**
 * Photos and signatures used to live as base64 data URLs inside the JSON
 * store. This moves them to disk (data/media/) and rewrites the references
 * to `/api/media/<file>`. Server-only.
 *
 * MEDIA_DIR overrides the folder (e.g. a mounted volume). An S3/R2 adapter
 * can be added behind the same three functions.
 */

export function mediaDir(): string {
  return process.env.MEDIA_DIR?.trim() || path.join(process.cwd(), "data", "media");
}

export function isDataUrl(s: string): boolean {
  return typeof s === "string" && s.startsWith("data:");
}

export function isMediaUrl(s: string): boolean {
  return typeof s === "string" && s.startsWith("/api/media/");
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

export function mimeForFile(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

/** Persist one data URL to disk. Returns the public path, or the input untouched when it is not a data URL. */
export async function storeDataUrl(dataUrl: string, prefix = "img"): Promise<string> {
  if (!isDataUrl(dataUrl)) return dataUrl;
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/);
  if (!m) return dataUrl;
  const mime = m[1].toLowerCase();
  const ext = EXT[mime];
  if (!ext) return dataUrl; // unknown type — leave inline
  const buf = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
  const name = `${prefix}-${randomUUID()}.${ext}`;
  await mkdir(mediaDir(), { recursive: true });
  await writeFile(path.join(mediaDir(), name), buf);
  return `/api/media/${name}`;
}

export async function storeDataUrls(urls: string[], prefix = "img"): Promise<string[]> {
  const out: string[] = [];
  for (const u of urls) out.push(await storeDataUrl(u, prefix));
  return out;
}

export async function storeBuffer(buf: Buffer, ext: "jpg" | "png" | "webp" | "pdf", prefix = "file"): Promise<string> {
  const name = `${prefix}-${randomUUID()}.${ext}`;
  await mkdir(mediaDir(), { recursive: true });
  await writeFile(path.join(mediaDir(), name), buf);
  return `/api/media/${name}`;
}

export async function readMedia(file: string): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!/^[a-z0-9_-]+\.(jpg|png|webp|gif|pdf)$/i.test(file)) return null;
  try {
    const full = path.join(mediaDir(), file);
    const buffer = await readFile(full);
    return { buffer, mime: mimeForFile(file) };
  } catch {
    return null;
  }
}

export async function deleteMedia(file: string): Promise<boolean> {
  if (!/^[a-z0-9_-]+\.(jpg|png|webp|gif|pdf)$/i.test(file)) return false;
  try {
    await unlink(path.join(mediaDir(), file));
    return true;
  } catch {
    return false;
  }
}

export async function mediaStats(): Promise<{ files: number; bytes: number }> {
  try {
    const { readdir } = await import("fs/promises");
    const names = await readdir(mediaDir());
    let bytes = 0;
    for (const n of names) {
      try {
        bytes += (await stat(path.join(mediaDir(), n))).size;
      } catch {
        /* ignore */
      }
    }
    return { files: names.length, bytes };
  } catch {
    return { files: 0, bytes: 0 };
  }
}

/**
 * One-time / nightly migration: move every inline data URL in the store to
 * disk. Idempotent — already-migrated references are skipped.
 */
export async function offloadInlineMedia(data: AppData, limit = 200): Promise<{ moved: number; remaining: number }> {
  let moved = 0;
  let remaining = 0;
  const budget = { left: limit };

  const move = async (arr: string[], prefix: string): Promise<string[]> => {
    const out: string[] = [];
    for (const u of arr) {
      if (isDataUrl(u) && budget.left > 0) {
        out.push(await storeDataUrl(u, prefix));
        budget.left -= 1;
        moved += 1;
      } else {
        if (isDataUrl(u)) remaining += 1;
        out.push(u);
      }
    }
    return out;
  };

  for (const p of data.jobProgress) p.imageDataUrls = await move(p.imageDataUrls, "progress");
  for (const d of data.damageReports) d.imageDataUrls = await move(d.imageDataUrls, "damage");
  for (const p of data.knockProposals) {
    if (p.signatureDataUrl && isDataUrl(p.signatureDataUrl)) {
      if (budget.left > 0) {
        p.signatureDataUrl = await storeDataUrl(p.signatureDataUrl, "sig");
        budget.left -= 1;
        moved += 1;
      } else remaining += 1;
    }
  }
  return { moved, remaining };
}

export function countInlineMedia(data: AppData): number {
  return (
    data.jobProgress.reduce((s, p) => s + p.imageDataUrls.filter(isDataUrl).length, 0) +
    data.damageReports.reduce((s, d) => s + d.imageDataUrls.filter(isDataUrl).length, 0) +
    data.knockProposals.filter((p) => p.signatureDataUrl && isDataUrl(p.signatureDataUrl)).length
  );
}
