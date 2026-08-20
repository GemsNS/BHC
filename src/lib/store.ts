import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile, rename } from "fs/promises";
import path from "path";
import type { AppData } from "./types";
import { buildSeedData } from "./seed";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

export async function readStore(): Promise<AppData> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    return JSON.parse(raw) as AppData;
  } catch {
    const seed = buildSeedData();
    await writeStore(seed);
    return seed;
  }
}

export async function writeStore(data: AppData): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${STORE_PATH}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, STORE_PATH);
}

export async function updateStore(
  mutator: (data: AppData) => AppData | void,
): Promise<AppData> {
  const data = await readStore();
  const result = mutator(data) ?? data;
  await writeStore(result);
  return result;
}

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
