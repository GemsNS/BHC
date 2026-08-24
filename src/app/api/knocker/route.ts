import { NextResponse } from "next/server";
import { z } from "zod";
import { bindPinsToTerritory, findDuplicateKnock, appendPinActivity } from "@/lib/knocker/ops";
import { closePolygon, simplifyPath } from "@/lib/knocker/geo";
import { onLeadCreated } from "@/lib/workflows";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import type { KnockEvent, KnockTerritory, Lead } from "@/lib/types";
import { normalizeAddressKey } from "@/lib/knocker/geo";

const outcomeEnum = z.enum([
  "not_home",
  "interested",
  "appointment",
  "not_interested",
  "do_not_knock",
  "pitched",
  "sold",
  "callback",
]);

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    zones: data.zones,
    knocks: data.knocks,
    territories: data.knockTerritories,
    tags: data.knockTags,
    products: data.knockProducts,
    services: data.knockServices,
    todos: data.knockTodos,
    proposals: data.knockProposals,
    chat: data.knockChat,
    repLocations: data.knockRepLocations,
    colorCodes: data.knockColorCodes,
    employees: data.employees,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const action = z
    .enum([
      "create_pin",
      "update_pin",
      "create_territory",
      "assign_territory",
      "create_todo",
      "complete_todo",
      "ping_location",
      "post_chat",
      "create_proposal",
    ])
    .parse(body.action);

  if (action === "create_pin") {
    const parsed = z
      .object({
        zoneId: z.string(),
        knockerId: z.string(),
        address: z.string(),
        outcome: outcomeEnum,
        notes: z.string().optional(),
        homeownerName: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        tagIds: z.array(z.string()).optional(),
        lat: z.number().nullable().optional(),
        lng: z.number().nullable().optional(),
        createLead: z.boolean().optional(),
        leadName: z.string().optional(),
        leadPhone: z.string().optional(),
        allowDuplicate: z.boolean().optional(),
      })
      .parse(body);

    const stamp = nowIso();
    let duplicateWarning: string | undefined;
    let knock: KnockEvent | null = null;
    let lead: Lead | null = null;

    await updateStore((data) => {
      const dup = findDuplicateKnock(data, parsed.address);
      if (dup && !parsed.allowDuplicate) {
        duplicateWarning = `Already knocked: ${dup.address} (${dup.outcome}) by team.`;
        return;
      }
      const zone = data.zones.find((z) => z.id === parsed.zoneId);
      const shouldLead =
        !!parsed.createLead &&
        ["interested", "appointment", "sold", "pitched"].includes(parsed.outcome);
      if (shouldLead) {
        lead = {
          id: newId(),
          name: parsed.leadName || parsed.homeownerName || `Knock @ ${parsed.address}`,
          phone: parsed.leadPhone || parsed.phone || "",
          email: parsed.email || "",
          address: parsed.address,
          city: zone?.city || "",
          source: "Door-to-door",
          status: ["appointment", "sold"].includes(parsed.outcome) ? "qualified" : "new",
          jobType: "residential",
          notes: parsed.notes ?? "",
          assignedToId: parsed.knockerId,
          companyId: null,
          leadScore: 55,
          createdAt: stamp,
          updatedAt: stamp,
        };
        data.leads.unshift(lead);
        onLeadCreated(data, lead, parsed.knockerId);
      }
      knock = {
        id: newId(),
        zoneId: parsed.zoneId,
        territoryId: null,
        knockerId: parsed.knockerId,
        address: parsed.address,
        addressKey: normalizeAddressKey(parsed.address),
        outcome: parsed.outcome,
        notes: parsed.notes ?? "",
        homeownerName: parsed.homeownerName ?? "",
        phone: parsed.phone ?? "",
        email: parsed.email ?? "",
        tagIds: parsed.tagIds ?? [],
        leadId: lead?.id ?? null,
        lat: parsed.lat ?? null,
        lng: parsed.lng ?? null,
        visitedByIds: [parsed.knockerId],
        activityLog: [],
        createdAt: stamp,
        updatedAt: stamp,
      };
      appendPinActivity(knock, "knock_logged", parsed.outcome, parsed.knockerId, newId, nowIso);
      data.knocks.unshift(knock);
    });

    if (duplicateWarning) {
      return NextResponse.json({ error: duplicateWarning, duplicate: true }, { status: 409 });
    }
    return NextResponse.json({ knock, lead }, { status: 201 });
  }

  if (action === "create_territory") {
    const parsed = z
      .object({
        name: z.string(),
        zoneId: z.string().nullable().optional(),
        points: z.array(z.object({ lat: z.number(), lng: z.number() })).min(3),
        colorHex: z.string().optional(),
        assignedRepIds: z.array(z.string()).optional(),
      })
      .parse(body);

    const simplified = simplifyPath(parsed.points);
    const polygon = closePolygon(simplified).map((p) => [p.lat, p.lng] as [number, number]);
    const stamp = nowIso();
    let territory: KnockTerritory | null = null;
    let bound = 0;

    await updateStore((data) => {
      territory = {
        id: newId(),
        name: parsed.name,
        zoneId: parsed.zoneId ?? null,
        polygon,
        colorHex: parsed.colorHex ?? "#ff2a2a",
        fillOpacity: 0.25,
        assignedRepIds: parsed.assignedRepIds ?? [],
        createdAt: stamp,
        updatedAt: stamp,
      };
      data.knockTerritories.unshift(territory);
      bound = bindPinsToTerritory(data, territory, newId, nowIso);
    });

    return NextResponse.json({ territory, pinsBound: bound }, { status: 201 });
  }

  if (action === "assign_territory") {
    const parsed = z
      .object({
        territoryId: z.string(),
        repIds: z.array(z.string()),
      })
      .parse(body);
    await updateStore((data) => {
      const t = data.knockTerritories.find((x) => x.id === parsed.territoryId);
      if (t) {
        t.assignedRepIds = parsed.repIds;
        t.updatedAt = nowIso();
      }
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "ping_location") {
    const parsed = z
      .object({
        employeeId: z.string(),
        lat: z.number(),
        lng: z.number(),
        accuracy: z.number().nullable().optional(),
      })
      .parse(body);
    const stamp = nowIso();
    await updateStore((data) => {
      data.knockRepLocations.unshift({
        id: newId(),
        employeeId: parsed.employeeId,
        lat: parsed.lat,
        lng: parsed.lng,
        accuracy: parsed.accuracy ?? null,
        recordedAt: stamp,
      });
      if (data.knockRepLocations.length > 500) data.knockRepLocations.length = 500;
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "create_todo") {
    const parsed = z
      .object({
        pinId: z.string().nullable().optional(),
        title: z.string(),
        body: z.string().optional(),
        dueAt: z.string().nullable().optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        assignedToId: z.string().nullable().optional(),
      })
      .parse(body);
    const todo = {
      id: newId(),
      pinId: parsed.pinId ?? null,
      title: parsed.title,
      body: parsed.body ?? "",
      dueAt: parsed.dueAt ?? null,
      priority: parsed.priority ?? "medium",
      assignedToId: parsed.assignedToId ?? null,
      completedAt: null,
      createdAt: nowIso(),
    };
    await updateStore((data) => {
      data.knockTodos.unshift(todo);
    });
    return NextResponse.json({ todo }, { status: 201 });
  }

  if (action === "complete_todo") {
    const id = z.string().parse(body.id);
    await updateStore((data) => {
      const t = data.knockTodos.find((x) => x.id === id);
      if (t) t.completedAt = nowIso();
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "post_chat") {
    const parsed = z
      .object({
        authorId: z.string(),
        body: z.string(),
        sharedPinId: z.string().nullable().optional(),
      })
      .parse(body);
    const msg = {
      id: newId(),
      channelId: "team-field",
      authorId: parsed.authorId,
      body: parsed.body,
      imageDataUrl: null,
      sharedPinId: parsed.sharedPinId ?? null,
      createdAt: nowIso(),
    };
    await updateStore((data) => {
      data.knockChat.unshift(msg);
    });
    return NextResponse.json({ message: msg }, { status: 201 });
  }

  if (action === "create_proposal") {
    const parsed = z
      .object({
        pinId: z.string(),
        createdById: z.string(),
        productIds: z.array(z.string()).optional(),
        serviceIds: z.array(z.string()).optional(),
      })
      .parse(body);
    let proposal = null as null | {
      id: string;
      pinId: string;
      productIds: string[];
      serviceIds: string[];
      lineItems: Array<{ label: string; amount: number }>;
      total: number;
      signedAt: string | null;
      signatureDataUrl: string | null;
      createdAt: string;
      createdById: string;
    };
    await updateStore((data) => {
      const products = data.knockProducts.filter((p) => parsed.productIds?.includes(p.id));
      const services = data.knockServices.filter((s) => parsed.serviceIds?.includes(s.id));
      const lineItems = [
        ...products.map((p) => ({ label: p.name, amount: p.unitPrice })),
        ...services.map((s) => ({ label: s.name, amount: s.basePrice })),
      ];
      const total = lineItems.reduce((s, l) => s + l.amount, 0);
      proposal = {
        id: newId(),
        pinId: parsed.pinId,
        productIds: parsed.productIds ?? [],
        serviceIds: parsed.serviceIds ?? [],
        lineItems,
        total,
        signedAt: null,
        signatureDataUrl: null,
        createdAt: nowIso(),
        createdById: parsed.createdById,
      };
      data.knockProposals.unshift(proposal);
    });
    return NextResponse.json({ proposal }, { status: 201 });
  }

  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
