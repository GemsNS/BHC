import { buildProductionSeed } from "./production-seed";
import type { AppData } from "./types";

/** Default store seed — clean Halifax HRM production starter */
export function buildSeedData(): AppData {
  return buildProductionSeed().data;
}

/** Full result including one-time staff PINs (only returned on POST /api/seed) */
export function buildSeedWithCredentials() {
  return buildProductionSeed();
}
