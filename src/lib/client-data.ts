"use client";

import { buildSeedData } from "./seed";
import { normalizeStore } from "./normalize";
import { isStaticDemo, withBasePath } from "./paths";
import type { AppData } from "./types";

const STORAGE_KEY = "bhc-crm-store-v2";

function readLocal(): AppData {
  if (typeof window === "undefined") return buildSeedData();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = buildSeedData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return normalizeStore(JSON.parse(raw) as Partial<AppData>);
  } catch {
    const seed = buildSeedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
}

function writeLocal(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function fetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (isStaticDemo()) {
    throw new Error("STATIC_DEMO_USE_LOCAL");
  }
  const res = await fetch(withBasePath(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Load full store — API when available, else localStorage demo */
export async function loadAppData(): Promise<AppData> {
  if (isStaticDemo()) return readLocal();
  try {
    const res = await fetch(withBasePath("/api/store"));
    if (!res.ok) throw new Error("api");
    return (await res.json()) as AppData;
  } catch {
    return readLocal();
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  if (isStaticDemo()) {
    writeLocal(data);
    return;
  }
  try {
    await fetch(withBasePath("/api/store"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {
    writeLocal(data);
  }
}

export async function mutateAppData(
  mutator: (data: AppData) => void,
): Promise<AppData> {
  const data = await loadAppData();
  mutator(data);
  await saveAppData(data);
  return data;
}

export function clientNewId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function clientNowIso(): string {
  return new Date().toISOString();
}

export function resetLocalDemo(): AppData {
  const seed = buildSeedData();
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  }
  return seed;
}
