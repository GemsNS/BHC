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
import type {
  AppData,
  CanvassOutcome,
  GpsTrackingConfig,
  KnockCalendarEvent,
  KnockEvent,
  KnockProposal,
  KnockTodo,
  Lead,
} from "@/lib/types";
import { computeProposalTotal, linesFromCatalog, signProposal } from "@/lib/proposals";
import { defaultEndAt } from "@/lib/calendar";

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
  | "knockCalendarEvents"
  | "notifications"
  | "gpsConfig"
>;

export async function loadKnockerData(): Promise<KnockerPayload> {
  if (isStaticDemo()) {
    const d = await loadAppData();
    return pickKnocker(d);
  }
  try {
    const raw = await fetchJson<Record<string, unknown>>("/api/knocker");
    return {
      zones: raw.zones as KnockerPayload["zones"],
      knocks: raw.knocks as KnockerPayload["knocks"],
      knockTerritories: (raw.territories ?? raw.knockTerritories) as KnockerPayload["knockTerritories"],
      knockTags: (raw.tags ?? raw.knockTags) as KnockerPayload["knockTags"],
      knockProducts: (raw.products ?? raw.knockProducts) as KnockerPayload["knockProducts"],
      knockServices: (raw.services ?? raw.knockServices) as KnockerPayload["knockServices"],
      knockTodos: (raw.todos ?? raw.knockTodos) as KnockerPayload["knockTodos"],
      knockProposals: (raw.proposals ?? raw.knockProposals) as KnockerPayload["knockProposals"],
      knockChat: (raw.chat ?? raw.knockChat) as KnockerPayload["knockChat"],
      knockRepLocations: (raw.repLocations ?? raw.knockRepLocations) as KnockerPayload["knockRepLocations"],
      knockColorCodes: (raw.colorCodes ?? raw.knockColorCodes) as KnockerPayload["knockColorCodes"],
      employees: raw.employees as KnockerPayload["employees"],
      knockCalendarEvents: (raw.calendarEvents ?? raw.knockCalendarEvents ?? []) as KnockerPayload["knockCalendarEvents"],
      notifications: (raw.notifications ?? []) as KnockerPayload["notifications"],
      gpsConfig: (raw.gpsConfig ?? {
        distanceFilterMeters: 25,
        desiredAccuracy: "balanced",
        enabled: true,
        wakeLock: true,
      }) as KnockerPayload["gpsConfig"],
    };
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
    knockCalendarEvents: d.knockCalendarEvents,
    notifications: d.notifications,
    gpsConfig: d.gpsConfig,
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

export async function createKnockTodo(input: {
  pinId?: string | null;
  title: string;
  body?: string;
  dueAt?: string | null;
  priority?: "low" | "medium" | "high";
  assignedToId?: string | null;
}): Promise<KnockTodo> {
  if (!isStaticDemo()) {
    const res = await fetchJson<{ todo: KnockTodo }>("/api/knocker", {
      method: "POST",
      body: JSON.stringify({ action: "create_todo", ...input }),
    });
    return res.todo;
  }
  const todo: KnockTodo = {
    id: clientNewId(),
    pinId: input.pinId ?? null,
    title: input.title,
    body: input.body ?? "",
    dueAt: input.dueAt ?? null,
    priority: input.priority ?? "medium",
    assignedToId: input.assignedToId ?? null,
    completedAt: null,
    createdAt: clientNowIso(),
    calendarEventId: null,
    reminderSentAt: null,
  };
  await mutateAppData((data) => {
    data.knockTodos.unshift(todo);
  });
  return todo;
}

export async function completeKnockTodo(id: string): Promise<void> {
  if (!isStaticDemo()) {
    await fetchJson("/api/knocker", {
      method: "POST",
      body: JSON.stringify({ action: "complete_todo", id }),
    });
    return;
  }
  await mutateAppData((data) => {
    const t = data.knockTodos.find((x) => x.id === id);
    if (t) t.completedAt = clientNowIso();
  });
}

export async function createKnockProposal(input: {
  pinId: string;
  createdById: string;
  productIds: string[];
  serviceIds: string[];
  extras?: Array<{ label: string; amount: number }>;
  taxRate?: number;
  notes?: string;
  appointmentAt?: string | null;
}): Promise<KnockProposal> {
  if (!isStaticDemo()) {
    const res = await fetchJson<{ proposal: KnockProposal }>("/api/knocker", {
      method: "POST",
      body: JSON.stringify({ action: "create_proposal", ...input }),
    });
    return res.proposal;
  }
  let proposal: KnockProposal | null = null;
  await mutateAppData((data) => {
    const lineItems = linesFromCatalog(
      data.knockProducts,
      data.knockServices,
      input.productIds,
      input.serviceIds,
      input.extras,
    );
    const taxRate = input.taxRate ?? 0;
    proposal = {
      id: clientNewId(),
      pinId: input.pinId,
      productIds: input.productIds,
      serviceIds: input.serviceIds,
      lineItems,
      total: computeProposalTotal(lineItems, taxRate),
      taxRate,
      notes: input.notes ?? "",
      status: "draft",
      signedAt: null,
      signatureDataUrl: null,
      signerName: null,
      signerEmail: null,
      appointmentAt: input.appointmentAt ?? null,
      createdAt: clientNowIso(),
      createdById: input.createdById,
    };
    data.knockProposals.unshift(proposal);
  });
  return proposal!;
}

export async function signKnockProposal(input: {
  proposalId: string;
  signerName: string;
  signerEmail?: string;
  signatureDataUrl: string;
}): Promise<KnockProposal> {
  if (!isStaticDemo()) {
    const res = await fetchJson<{ proposal: KnockProposal }>("/api/knocker", {
      method: "POST",
      body: JSON.stringify({ action: "sign_proposal", ...input }),
    });
    return res.proposal;
  }
  let signed: KnockProposal | null = null;
  await mutateAppData((data) => {
    const p = data.knockProposals.find((x) => x.id === input.proposalId);
    if (!p) return;
    Object.assign(
      p,
      signProposal(p, {
        signerName: input.signerName,
        signerEmail: input.signerEmail,
        signatureDataUrl: input.signatureDataUrl,
        nowIso: clientNowIso(),
      }),
    );
    signed = p;
  });
  if (!signed) throw new Error("Proposal not found");
  return signed;
}

export async function createCalendarEvent(input: {
  title: string;
  startAt: string;
  endAt?: string;
  location?: string;
  description?: string;
  pinId?: string | null;
  todoId?: string | null;
  employeeId: string;
}): Promise<KnockCalendarEvent> {
  if (!isStaticDemo()) {
    const res = await fetchJson<{ event: KnockCalendarEvent }>("/api/knocker", {
      method: "POST",
      body: JSON.stringify({ action: "create_calendar", ...input }),
    });
    return res.event;
  }
  const ev: KnockCalendarEvent = {
    id: clientNewId(),
    title: input.title,
    startAt: input.startAt,
    endAt: input.endAt ?? defaultEndAt(input.startAt),
    location: input.location ?? "",
    description: input.description ?? "",
    pinId: input.pinId ?? null,
    todoId: input.todoId ?? null,
    employeeId: input.employeeId,
    icsUid: `${clientNewId()}@bhcontracting.ca`,
    googleEventId: null,
    createdAt: clientNowIso(),
  };
  await mutateAppData((data) => {
    data.knockCalendarEvents.unshift(ev);
  });
  return ev;
}

export async function saveGpsConfigClient(cfg: GpsTrackingConfig): Promise<void> {
  if (!isStaticDemo()) {
    await fetchJson("/api/knocker", {
      method: "POST",
      body: JSON.stringify({ action: "save_gps", ...cfg }),
    });
    return;
  }
  await mutateAppData((data) => {
    data.gpsConfig = cfg;
  });
}
