/** CRA reasonable automobile allowance (CAD/km) — first 5,000 km band. */
export const CRA_RATE_PER_KM = 0.72;

export const UNIACKE_SITE_TRAVEL = {
  fromAddress: "9A Regency Drive, Dartmouth, NS",
  toAddress: "9 Alicia Scott Ave, Mount Uniacke, NS",
  /** Round-trip driving distance (OSRM), km */
  distanceKm: 69.8,
  ratePerKm: CRA_RATE_PER_KM,
  notes:
    "Round-trip fuel/travel: 9A Regency Drive, Dartmouth ↔ Mount Uniacke site (Alicia Scott Ave) and back.",
} as const;

export function travelCost(distanceKm: number, ratePerKm = CRA_RATE_PER_KM): number {
  return Math.round(distanceKm * ratePerKm * 100) / 100;
}
