import type { AppData, KnockEvent, KnockTerritory } from "@/lib/types";
import { normalizeAddressKey, pinsInPolygon, type LatLng } from "./geo";

export function findDuplicateKnock(
  data: AppData,
  address: string,
  excludeId?: string,
): KnockEvent | undefined {
  const key = normalizeAddressKey(address);
  return data.knocks.find(
    (k) => k.addressKey === key && k.id !== excludeId && k.outcome !== "do_not_knock",
  );
}

export function appendPinActivity(
  pin: KnockEvent,
  action: string,
  detail: string,
  authorId: string,
  newId: () => string,
  nowIso: () => string,
): void {
  if (!pin.activityLog) pin.activityLog = [];
  pin.activityLog.unshift({
    id: newId(),
    action,
    detail,
    authorId,
    createdAt: nowIso(),
  });
  if (pin.activityLog.length > 50) pin.activityLog.length = 50;
  pin.updatedAt = nowIso();
}

export function assignTerritoryToReps(
  territory: KnockTerritory,
  repIds: string[],
): void {
  territory.assignedRepIds = repIds;
}

export function bindPinsToTerritory(
  data: AppData,
  territory: KnockTerritory,
  newId: () => string,
  nowIso: () => string,
): number {
  const polygon: LatLng[] = territory.polygon.map(([lat, lng]) => ({ lat, lng }));
  const pins = pinsInPolygon(
    data.knocks.filter((k) => k.lat != null && k.lng != null) as Array<
      KnockEvent & { lat: number; lng: number }
    >,
    polygon,
  );
  for (const pin of pins) {
    pin.territoryId = territory.id;
    if (territory.zoneId) pin.zoneId = territory.zoneId;
    appendPinActivity(
      pin,
      "territory_bind",
      `Assigned to turf ${territory.name}`,
      "emp-admin",
      newId,
      nowIso,
    );
  }
  return pins.length;
}

export type LeaderboardRow = {
  employeeId: string;
  name: string;
  knocks: number;
  appointments: number;
  sold: number;
  pitched: number;
  score: number;
};

export function buildKnockerLeaderboard(
  data: Pick<AppData, "knocks" | "employees">,
  since?: Date,
): LeaderboardRow[] {
  const cutoff = since?.getTime() ?? 0;
  const rows = new Map<string, LeaderboardRow>();

  for (const emp of data.employees.filter((e) => e.active)) {
    rows.set(emp.id, {
      employeeId: emp.id,
      name: emp.name,
      knocks: 0,
      appointments: 0,
      sold: 0,
      pitched: 0,
      score: 0,
    });
  }

  for (const k of data.knocks) {
    if (since && new Date(k.createdAt).getTime() < cutoff) continue;
    const row = rows.get(k.knockerId);
    if (!row) continue;
    row.knocks += 1;
    if (k.outcome === "appointment") row.appointments += 1;
    if (k.outcome === "sold") row.sold += 1;
    if (k.outcome === "pitched") row.pitched += 1;
    row.score += k.outcome === "sold" ? 25 : k.outcome === "appointment" ? 15 : k.outcome === "pitched" ? 8 : 3;
  }

  return [...rows.values()]
    .filter((r) => r.knocks > 0)
    .sort((a, b) => b.score - a.score);
}
