/** Geographic helpers — RDP simplification, point-in-polygon, polygon closure */

export type LatLng = { lat: number; lng: number };

export function closePolygon(points: LatLng[]): LatLng[] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.lat === last.lat && first.lng === last.lng) return points;
  return [...points, { ...first }];
}

/** Ramer–Douglas–Peucker path simplification (meters-ish via degree epsilon) */
export function simplifyPath(points: LatLng[], epsilon = 0.00005): LatLng[] {
  if (points.length <= 2) return points;

  function perpendicularDistance(p: LatLng, a: LatLng, b: LatLng): number {
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    if (dx === 0 && dy === 0) {
      return Math.hypot(p.lat - a.lat, p.lng - a.lng);
    }
    const t = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy);
    const proj = {
      lat: a.lat + t * dy,
      lng: a.lng + t * dx,
    };
    return Math.hypot(p.lat - proj.lat, p.lng - proj.lng);
  }

  function rdp(pts: LatLng[], eps: number): LatLng[] {
    if (pts.length < 3) return pts;
    let maxDist = 0;
    let idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = perpendicularDistance(pts[i], pts[0], pts[pts.length - 1]);
      if (d > maxDist) {
        maxDist = d;
        idx = i;
      }
    }
    if (maxDist > eps) {
      const left = rdp(pts.slice(0, idx + 1), eps);
      const right = rdp(pts.slice(idx), eps);
      return [...left.slice(0, -1), ...right];
    }
    return [pts[0], pts[pts.length - 1]];
  }

  return rdp(points, epsilon);
}

/** Ray-casting point-in-polygon */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pinsInPolygon<T extends LatLng>(
  pins: T[],
  polygon: LatLng[],
): T[] {
  const closed = closePolygon(polygon);
  return pins.filter((p) => pointInPolygon(p, closed));
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function normalizeAddressKey(address: string): string {
  return address.toLowerCase().replace(/[^a-z0-9]/g, "");
}
