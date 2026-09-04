/**
 * Local disk uploads for Mainframe attachments (auth-gated).
 */

import { promises as fs } from "fs";
import path from "path";
import { envInt } from "./rate-limit";

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export type StoredUpload = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  storedName: string;
  relativePath: string;
  uploadedBy: string;
  createdAt: string;
};

function uploadsRoot() {
  return path.join(process.cwd(), "data", "uploads");
}

function metaPath() {
  return path.join(uploadsRoot(), "index.json");
}

export function uploadLimits() {
  return {
    maxBytes: envInt("UPLOAD_MAX_BYTES", 8 * 1024 * 1024),
    maxFilesPerRequest: envInt("UPLOAD_MAX_FILES", 6),
  };
}

async function readIndex(): Promise<StoredUpload[]> {
  try {
    const raw = await fs.readFile(metaPath(), "utf8");
    return JSON.parse(raw) as StoredUpload[];
  } catch {
    return [];
  }
}

async function writeIndex(items: StoredUpload[]) {
  await fs.mkdir(uploadsRoot(), { recursive: true });
  await fs.writeFile(metaPath(), JSON.stringify(items.slice(-500), null, 2) + "\n", "utf8");
}

export function isAllowedMime(mime: string): boolean {
  return ALLOWED.has(mime);
}

export async function saveUpload(input: {
  id: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  uploadedBy: string;
}): Promise<StoredUpload> {
  const limits = uploadLimits();
  if (input.buffer.length > limits.maxBytes) {
    throw new Error(`File exceeds ${limits.maxBytes} byte limit.`);
  }
  if (!isAllowedMime(input.mimeType)) {
    throw new Error("File type not allowed.");
  }
  await fs.mkdir(uploadsRoot(), { recursive: true });
  const safeBase = input.originalName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "file";
  const storedName = `${input.id}-${safeBase}`;
  const full = path.join(uploadsRoot(), storedName);
  await fs.writeFile(full, input.buffer);
  const record: StoredUpload = {
    id: input.id,
    originalName: input.originalName,
    mimeType: input.mimeType,
    size: input.buffer.length,
    storedName,
    relativePath: `uploads/${storedName}`,
    uploadedBy: input.uploadedBy,
    createdAt: new Date().toISOString(),
  };
  const index = await readIndex();
  index.push(record);
  await writeIndex(index);
  return record;
}

export async function listUploads(limit = 50): Promise<StoredUpload[]> {
  const index = await readIndex();
  return index.slice(-limit).reverse();
}

export async function readUploadFile(storedName: string): Promise<Buffer | null> {
  if (storedName.includes("..") || storedName.includes("/") || storedName.includes("\\")) {
    return null;
  }
  try {
    return await fs.readFile(path.join(uploadsRoot(), storedName));
  } catch {
    return null;
  }
}
