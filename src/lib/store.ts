import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile, rename } from "fs/promises";
import path from "path";
import type { AppData } from "./types";
import { buildSeedData } from "./seed";
import { normalizeStore } from "./normalize";

export { normalizeStore };

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

export async function readStore(): Promise<AppData> {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppData>;
    const normalized = normalizeStore(parsed);
    const rawAdmin = (parsed.employees ?? []).find(
      (e) => e.id === "emp-admin" || e.login?.toLowerCase() === "jordan",
    );
    const needsEmployeeMigration =
      !!rawAdmin &&
      (rawAdmin.login?.toLowerCase() === "jordan" ||
        rawAdmin.email?.toLowerCase().startsWith("jordan@") ||
        /@bighoss\.com$/i.test(rawAdmin.email ?? ""));
    // Persist migrations when new collections were missing or identity renamed
    if (
      needsEmployeeMigration ||
      !parsed.zones ||
      !parsed.knocks ||
      !parsed.knockTerritories ||
      !parsed.knockTags ||
      !parsed.knockCalendarEvents ||
      !parsed.webhookEndpoints ||
      !parsed.materials ||
      !parsed.fuelLogs ||
      !parsed.projections ||
      !parsed.tools ||
      !parsed.inventory ||
      !parsed.jobProgress ||
      !parsed.invoices ||
      !parsed.shifts ||
      !parsed.workflows ||
      !parsed.companies ||
      !parsed.assistantMemory
    ) {
      await writeStore(normalized);
    }
    return normalized;
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
