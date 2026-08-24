import type { LatLng } from "./geo";

export type ClusterablePin = LatLng & { id: string; color: string };

export type PinCluster = {
  id: string;
  lat: number;
  lng: number;
  count: number;
  color: string;
  pinIds: string[];
};

/** Grid-based clustering for map viewport performance */
export function clusterPins(
  pins: ClusterablePin[],
  zoom: number,
  bounds?: { north: number; south: number; east: number; west: number },
): { clusters: PinCluster[]; singles: ClusterablePin[] } {
  if (zoom >= 16 || pins.length < 40) {
    return { clusters: [], singles: pins };
  }

  const cell =
    zoom >= 14 ? 0.002 : zoom >= 12 ? 0.005 : zoom >= 10 ? 0.012 : 0.025;

  const grid = new Map<string, ClusterablePin[]>();
  for (const pin of pins) {
    if (bounds) {
      if (
        pin.lat < bounds.south ||
        pin.lat > bounds.north ||
        pin.lng < bounds.west ||
        pin.lng > bounds.east
      ) {
        continue;
      }
    }
    const key = `${Math.floor(pin.lat / cell)}:${Math.floor(pin.lng / cell)}:${pin.color}`;
    const bucket = grid.get(key) ?? [];
    bucket.push(pin);
    grid.set(key, bucket);
  }

  const clusters: PinCluster[] = [];
  const singles: ClusterablePin[] = [];

  for (const [, group] of grid) {
    if (group.length === 1) {
      singles.push(group[0]);
      continue;
    }
    const lat = group.reduce((s, p) => s + p.lat, 0) / group.length;
    const lng = group.reduce((s, p) => s + p.lng, 0) / group.length;
    clusters.push({
      id: `c-${group.map((p) => p.id).join("-").slice(0, 32)}`,
      lat,
      lng,
      count: group.length,
      color: group[0].color,
      pinIds: group.map((p) => p.id),
    });
  }

  return { clusters, singles };
}
