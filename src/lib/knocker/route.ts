import { haversineMeters, type LatLng } from "./geo";

/** Nearest-neighbor route sequencing for canvassing */
export function optimizeRoute(start: LatLng, stops: LatLng[]): LatLng[] {
  if (stops.length <= 1) return [...stops];
  const remaining = [...stops];
  const ordered: LatLng[] = [];
  let current = start;

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(current, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    current = next;
  }

  return ordered;
}

export function navigationUrl(lat: number, lng: number, provider: "google" | "apple" | "waze" = "google"): string {
  if (provider === "waze") {
    return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  }
  if (provider === "apple") {
    return `https://maps.apple.com/?daddr=${lat},${lng}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
