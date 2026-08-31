import { buildProductionSeed } from "./production-seed";
import type { AppData } from "./types";

export function buildSeedData(): AppData {
  return buildProductionSeed();
}
