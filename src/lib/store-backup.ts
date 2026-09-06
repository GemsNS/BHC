import { copyFile, mkdir, readdir, readFile, stat, unlink, utimes } from "fs/promises";
import path from "path";
import { normalizeStore } from "./normalize";
import { storePaths, writeStore } from "./store";
import type { AppData } from "./types";

/**
 * Rotating JSON snapshots of data/store.json → data/backups/.
 * Server-only (filesystem).
 */

export type BackupInfo = {
  name: string;
  path: string;
  bytes: number;
  createdAt: string;
};

export type BackupOptions = {
  dataDir?: string;
  storePath?: string;
  /** How many snapshots to keep (oldest pruned). Env BHC_BACKUP_KEEP, default 14. */
  keep?: number;
  /** Prefix for the file name */
  label?: string;
};

function keepCount(opts: BackupOptions): number {
  if (opts.keep && opts.keep > 0) return opts.keep;
  const env = Number(process.env.BHC_BACKUP_KEEP ?? "");
  return Number.isFinite(env) && env > 0 ? env : 14;
}

export function backupDir(dataDir?: string): string {
  return path.join(dataDir ?? storePaths().dataDir, "backups");
}

function stampForFile(d = new Date()): string {
  return d.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

export async function listBackups(dataDir?: string): Promise<BackupInfo[]> {
  const dir = backupDir(dataDir);
  try {
    const names = (await readdir(dir)).filter((n) => n.endsWith(".json"));
    const infos = await Promise.all(
      names.map(async (name) => {
        const full = path.join(dir, name);
        const s = await stat(full);
        return { name, path: full, bytes: s.size, createdAt: s.mtime.toISOString() };
      }),
    );
    return infos.sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name),
    );
  } catch {
    return [];
  }
}

/** Newest backup timestamp, or null when none exist. */
export async function latestBackupAt(dataDir?: string): Promise<string | null> {
  const list = await listBackups(dataDir);
  return list[0]?.createdAt ?? null;
}

export async function createBackup(opts: BackupOptions = {}): Promise<BackupInfo | null> {
  const { dataDir, storePath } = storePaths();
  const src = opts.storePath ?? storePath;
  const dir = backupDir(opts.dataDir ?? dataDir);
  await mkdir(dir, { recursive: true });
  try {
    await stat(src);
  } catch {
    return null; // nothing to back up yet
  }
  const now = new Date();
  const name = `${opts.label ?? "store"}-${stampForFile(now)}.json`;
  const dest = path.join(dir, name);
  await copyFile(src, dest);
  // copyFile may preserve the source mtime on some platforms — stamp the snapshot time explicitly
  await utimes(dest, now, now).catch(() => undefined);
  await pruneBackups(opts.dataDir ?? dataDir, keepCount(opts));
  const s = await stat(dest);
  return { name, path: dest, bytes: s.size, createdAt: s.mtime.toISOString() };
}

export async function pruneBackups(dataDir: string | undefined, keep: number): Promise<number> {
  const list = await listBackups(dataDir);
  const extra = list.slice(keep);
  for (const b of extra) {
    try {
      await unlink(b.path);
    } catch {
      /* ignore */
    }
  }
  return extra.length;
}

/**
 * Restore a snapshot into the live store. Takes a safety backup of the
 * current store first (label `pre-restore`).
 */
export async function restoreBackup(
  name: string,
  opts: BackupOptions = {},
): Promise<{ restored: string; safetyBackup: string | null; counts: Record<string, number> }> {
  if (name.includes("/") || name.includes("\\") || !name.endsWith(".json")) {
    throw new Error("Invalid backup name");
  }
  const dir = backupDir(opts.dataDir);
  const full = path.join(dir, name);
  const raw = await readFile(full, "utf8");
  const parsed = JSON.parse(raw) as Partial<AppData>;
  const normalized = normalizeStore(parsed);
  const safety = await createBackup({ ...opts, label: "pre-restore" });
  await writeStore(normalized);
  return {
    restored: name,
    safetyBackup: safety?.name ?? null,
    counts: {
      employees: normalized.employees.length,
      leads: normalized.leads.length,
      jobs: normalized.jobs.length,
      invoices: normalized.invoices.length,
    },
  };
}

/** True when no backup exists for the current calendar day. */
export async function backupDueToday(dataDir?: string, now = new Date()): Promise<boolean> {
  const latest = await latestBackupAt(dataDir);
  if (!latest) return true;
  return latest.slice(0, 10) !== now.toISOString().slice(0, 10);
}
