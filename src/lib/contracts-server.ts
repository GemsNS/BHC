import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import type { ContractMeta } from "./contracts";
import { isValidContractSlug } from "./contracts";

export const CONTRACTS_ROOT = path.join(process.cwd(), "contracts");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".json": "application/json",
};

function contractDir(slug: string): string {
  if (!isValidContractSlug(slug)) {
    throw new Error("Invalid contract slug");
  }
  return path.join(CONTRACTS_ROOT, slug);
}

function safeFileName(name: string): string {
  const base = path.basename(name);
  if (base.includes("..") || base.startsWith(".")) {
    throw new Error("Invalid file name");
  }
  return base;
}

export async function listContractFiles(slug: string): Promise<string[]> {
  const dir = contractDir(slug);
  try {
    const entries = await readdir(dir);
    return entries.filter(
      (f) => !f.startsWith(".") && f !== "meta.json" && f !== "README.md",
    );
  } catch {
    return [];
  }
}

export async function readContractMeta(slug: string): Promise<ContractMeta | null> {
  try {
    const raw = await readFile(path.join(contractDir(slug), "meta.json"), "utf8");
    return JSON.parse(raw) as ContractMeta;
  } catch {
    return null;
  }
}

export async function resolvePrimaryContractFile(slug: string): Promise<string | null> {
  const files = await listContractFiles(slug);
  if (!files.length) return null;
  const preferred = [
    "Snow-Removal-Service-Agreement.pdf",
    "contract.pdf",
    "index.html",
    "contract.html",
  ];
  for (const name of preferred) {
    if (files.includes(name)) return name;
  }
  const doc = files.find((f) => /\.(html?|pdf|docx?)$/i.test(f));
  return doc ?? files[0];
}

export async function readContractFile(
  slug: string,
  fileName?: string,
): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
  const chosen = fileName ? safeFileName(fileName) : await resolvePrimaryContractFile(slug);
  if (!chosen) return null;
  const full = path.join(contractDir(slug), chosen);
  const info = await stat(full);
  if (!info.isFile()) return null;
  const buffer = await readFile(full);
  const ext = path.extname(chosen).toLowerCase();
  return {
    buffer,
    fileName: chosen,
    mimeType: MIME[ext] ?? "application/octet-stream",
  };
}
