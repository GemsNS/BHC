"use client";

import {
  clientNewId,
  clientNowIso,
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import {
  appendPinActivity,
  bindPinsToTerritory,
  findDuplicateKnock,
} from "@/lib/knocker/ops";
import { closePolygon, normalizeAddressKey, simplifyPath, type LatLng } from "@/lib/knocker/geo";
import { onLeadCreated } from "@/lib/workflows";
import type { AppData, CanvassOutcome, KnockEvent, Lead } from "@/lib/types";

export type KnockerPayload = Pick<
  AppData,
  | "zones"
  | "knocks"
  | "knockTerritories"
  | "knockTags"
  | "knockProducts"
  | "knockServices"
  | "knockTodos"
  | "knockProposals"
  | "knockChat"
  | "knockRepLocations"
  | "knockColorCodes"
  | "employees"
>;

export async function loadKnockerData(): Promise<KnockerPayload> {
  if (isStaticDemo()) {
    const d = await loadAppData();
    return pickKnocker(d);
  }
  try {
    return await fetchJson<KnockerPayload>("/api/knocker");
  } catch {
    return pickKnocker(await loadAppData());
  }
}

function pickKnocker(d: AppData): KnockerPayload {
  return {
    zones: d.zones,
    knocks: d.knocks,
    knockTerritories: d.knockTerritories,
    knockTags: d.knockTags,
    knockProducts: d.knockProducts,
    knockServices: d.knockServices,
    knockTodos: d.knockTodos,
    knockProposals: d.knockProposals,
    knockChat: d.knockChat,
    knockRepLocations: d.knockRepLocations,
    knockColorCodes: d.knockColorCodes,
    employees: d.employees,
  };
}

export async function createKnockPin(input: {
  zoneId: string;
  knockerId: string;
  address: string;
  outcome: CanvassOutcome;
  notes?: string;
  homeownerName?: string;
  phone?: string;
  email?: string;
  tagIds?: string[];
  lat?: number | null;
  lng?: number | null;
  createLead?: boolean;
  allowDuplicate?: boolean;
}): Promise<{ knock: KnockEvent; lead: Lead | null; duplicate?: string }> {
  if (!isStaticDemo()) {
    try {
      return await fetchJson("/api/knocker", {
        method: "POST",
        body: JSON.stringify({ action: "create_pin", ...input }),
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes("409")) throw e;
    }
  }

  let result: { knock: KnockEvent; lead: Lead | null; duplicate?: string } = {
    knock: {} as KnockEvent,
    lead: null,
  };

  await mutateAppData((data) => {
    const dup = findDuplicateKnock(data, input.address);
    if (dup && !input.allowDuplicate) {
      result.duplicate = `Already knocked: ${dup.address}`;
      return;
    }
    const stamp = clientNowIso();
    const zone = data.zones.find((z) => z.id === input.zoneId);
    let lead: Lead | null = null;
    if (
      input.createLead &&
      ["interested", "appointment", "sold", "pitched"].includes(input.outcome)
    ) {
      lead = {
        id: clientNewId(),
        name: input.homeownerName || `Knock @ ${input.address}`,
        phone: input.phone || "",
        email: input.email || "",
        address: input.address,
        city: zone?.city || "",
        source: "Door-to-door",
        status: ["appointment", "sold"].includes(input.outcome) ? "qualified" : "new",
        jobType: "residential",
        notes: input.notes ?? "",
        assignedToId: input.knockerId,
        companyId: null,
        leadScore: 55,
        createdAt: stamp,
        updatedAt: stamp,
      };
      data.leads.unshift(lead);
      onLeadCreated(data, lead, input.knockerId);
    }
    const knock: KnockEvent = {
      id: clientNewId(),
      zoneId: input.zoneId,
      territoryId: null,
      knockerId: input.knockerId,
      address: input.address,
      addressKey: normalizeAddressKey(input.address),
      outcome: input.outcome,
      notes: input.notes ?? "",
      homeownerName: input.homeownerName ?? "",
      phone: input.phone ?? "",
      email: input.email ?? "",
      tagIds: input.tagIds ?? [],
      leadId: lead?.id ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      visitedByIds: [input.knockerId],
      activityLog: [],
      createdAt: stamp,
      updatedAt: stamp,
    };
    appendPinActivity(knock, "knock_logged", input.outcome, input.knockerId, clientNewId, clientNowIso);
    data.knocks.unshift(knock);
    result = { knock, lead };
  });

  if (result.duplicate) throw new Error(result.duplicate);
  return result;
}

export async function createTerritory(input: {
  name: string;
  zoneId: string | null;
  points: LatLng[];
  colorHex?: string;
  assignedRepIds?: string[];
}): Promise<number> {
  if (!isStaticDemo()) {
    const res = await fetchJson<{ pinsBound: number }>("/api/knocker", {
      method: "POST",
      body: JSON.stringify({ action: "create_territory", ...input }),
    });
    return res.pinsBound;
  }

  let bound = 0;
  await mutateAppData((data) => {
    const simplified = simplifyPath(input.points);
    const polygon = closePolygon(simplified).map((p) => [p.lat, p.lng] as [number, number]);
    const stamp = clientNowIso();
    const territory = {
      id: clientNewId(),
      name: input.name,
      zoneId: input.zoneId,
      polygon,
      colorHex: input.colorHex ?? "#ff2a2a",
      fillOpacity: 0.25,
      assignedRepIds: input.assignedRepIds ?? [],
      createdAt: stamp,
      updatedAt: stamp,
    };
    data.knockTerritories.unshift(territory);
    bound = bindPinsToTerritory(data, territory, clientNewId, clientNowIso);
  });
  return bound;
}

export async function pingRepLocation(employeeId: string, lat: number, lng: number) {
  if (!isStaticDemo()) {
    await fetchJson("/api/knocker", {
      method: "POST",
      body: JSON.stringify({
        action: "ping_location",
        employeeId,
        lat,
        lng,
      }),
    });
    return;
  }
  await mutateAppData((data) => {
    data.knockRepLocations.unshift({
      id: clientNewId(),
      employeeId,
      lat,
      lng,
      accuracy: null,
      recordedAt: clientNowIso(),
    });
  });
}

export async function postKnockChat(authorId: string, body: string) {
  if (!isStaticDemo()) {
    await fetchJson("/api/knocker", {
      method: "POST",
      body: JSON.stringify({ action: "post_chat", authorId, body }),
    });
    return;
  }
  await mutateAppData((data) => {
    data.knockChat.unshift({
      id: clientNewId(),
      channelId: "team-field",
      authorId,
      body,
      imageDataUrl: null,
      sharedPinId: null,
      createdAt: clientNowIso(),
    });
  });
}
