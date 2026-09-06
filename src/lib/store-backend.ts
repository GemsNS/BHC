import { createHash } from "crypto";
import { mkdir, readFile, rename, stat, writeFile } from "fs/promises";
import path from "path";
import type { AppData } from "./types";

/**
 * Pluggable persistence for the AppData aggregate.
 *
 *   json    (default) data/store.json — one atomic file write per mutation
 *   sqlite  BHC_STORE=sqlite → data/store.sqlite, one row per collection,
 *           WAL mode, only changed collections are rewritten. Needs Node ≥ 22.13
 *           (built-in node:sqlite). Falls back to json with a warning otherwise.
 *
 * Both keep the same `readAll` / `writeAll` contract so nothing above the
 * store layer changes. `exportJson` is used by backups in sqlite mode.
 */

export type StoreBackendKind = "json" | "sqlite";

export interface StoreBackend {
  readonly kind: StoreBackendKind;
  readonly location: string;
  exists(): Promise<boolean>;
  readAll(): Promise<Partial<AppData> | null>;
  writeAll(data: AppData): Promise<void>;
  /** Release file handles (tests, graceful shutdown) */
  close?: () => void;
}

const DATA_DIR = path.join(process.cwd(), "data");

/* ------------------------------- JSON ------------------------------- */

export function jsonBackend(storePath = path.join(DATA_DIR, "store.json")): StoreBackend {
  return {
    kind: "json",
    location: storePath,
    async exists() {
      try {
        await stat(storePath);
        return true;
      } catch {
        return false;
      }
    },
    async readAll() {
      try {
        return JSON.parse(await readFile(storePath, "utf8")) as Partial<AppData>;
      } catch {
        return null;
      }
    },
    async writeAll(data) {
      await mkdir(path.dirname(storePath), { recursive: true });
      const tmp = `${storePath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
      await rename(tmp, storePath);
    },
  };
}

/* ------------------------------ SQLite ------------------------------ */

type Sqlite = typeof import("node:sqlite");

let sqliteModule: Sqlite | null | undefined;

async function loadSqlite(): Promise<Sqlite | null> {
  if (sqliteModule !== undefined) return sqliteModule;
  try {
    // process.getBuiltinModule (Node ≥ 22.3) keeps bundlers from trying to resolve
    // the node: scheme; returns undefined on runtimes without node:sqlite.
    const getBuiltin = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
    sqliteModule = (getBuiltin?.("node:sqlite") as Sqlite | undefined) ?? null;
  } catch {
    sqliteModule = null;
  }
  return sqliteModule;
}

function hashJson(json: string): string {
  return createHash("sha1").update(json).digest("hex");
}


export async function sqliteBackend(dbPath = path.join(DATA_DIR, "store.sqlite")): Promise<StoreBackend | null> {
  const mod = await loadSqlite();
  if (!mod) return null;
  await mkdir(path.dirname(dbPath), { recursive: true });
  const g = globalThis as unknown as Record<symbol, InstanceType<Sqlite["DatabaseSync"]> | undefined>;
  const dbKey = Symbol.for(`bhc.sqlite.db:${dbPath}`);
  if (!g[dbKey]) {
    const db = new mod.DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    db.exec(
      "CREATE TABLE IF NOT EXISTS collections (name TEXT PRIMARY KEY, json TEXT NOT NULL, hash TEXT NOT NULL, updated_at TEXT NOT NULL)",
    );
    db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    g[dbKey] = db;
  }
  const db = g[dbKey]!;
  const hashes = new Map<string, string>();

  return {
    kind: "sqlite",
    location: dbPath,
    close() {
      try {
        db.close();
      } catch {
        /* already closed */
      }
      delete g[dbKey];
    },
    async exists() {
      const row = db.prepare("SELECT COUNT(*) AS n FROM collections").get();
      return Number(row?.n ?? 0) > 0;
    },
    async readAll() {
      const rows = db.prepare("SELECT name, json, hash FROM collections").all();
      if (!rows.length) return null;
      const out: Record<string, unknown> = {};
      for (const r of rows) {
        const name = String(r.name);
        out[name] = JSON.parse(String(r.json));
        hashes.set(name, String(r.hash));
      }
      return out as Partial<AppData>;
    },
    async writeAll(data) {
      const now = new Date().toISOString();
      const upsert = db.prepare(
        "INSERT INTO collections (name, json, hash, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET json = excluded.json, hash = excluded.hash, updated_at = excluded.updated_at",
      );
      db.exec("BEGIN");
      try {
        for (const [name, value] of Object.entries(data)) {
          const json = JSON.stringify(value);
          const h = hashJson(json);
          if (hashes.get(name) === h) continue;
          upsert.run(name, json, h, now);
          hashes.set(name, h);
        }
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}

/* ------------------------------ resolve ------------------------------ */

const BACKEND_KEY = Symbol.for("bhc.store.backend");

export async function resolveBackend(): Promise<StoreBackend> {
  const g = globalThis as unknown as Record<symbol, StoreBackend | undefined>;
  if (g[BACKEND_KEY]) return g[BACKEND_KEY]!;
  const want = (process.env.BHC_STORE ?? "json").trim().toLowerCase();
  let backend: StoreBackend | null = null;
  if (want === "sqlite") {
    backend = await sqliteBackend();
    if (!backend) {
      console.warn("[bhc store] BHC_STORE=sqlite but node:sqlite is unavailable (Node < 22.13) — using JSON store.");
    } else if (!(await backend.exists())) {
      // First run on sqlite: import the existing JSON store if there is one
      const json = jsonBackend();
      const existing = await json.readAll();
      if (existing) {
        await backend.writeAll(existing as AppData);
        console.log(`[bhc store] imported ${json.location} into ${backend.location}`);
      }
    }
  }
  g[BACKEND_KEY] = backend ?? jsonBackend();
  return g[BACKEND_KEY]!;
}

export function currentBackendKind(): StoreBackendKind {
  const g = globalThis as unknown as Record<symbol, StoreBackend | undefined>;
  return g[BACKEND_KEY]?.kind ?? ((process.env.BHC_STORE ?? "json").toLowerCase() === "sqlite" ? "sqlite" : "json");
}
