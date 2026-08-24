import { NextResponse } from "next/server";
import { z } from "zod";
import { bindPinsToTerritory, findDuplicateKnock, appendPinActivity } from "@/lib/knocker/ops";
import { closePolygon, simplifyPath } from "@/lib/knocker/geo";
import { onLeadCreated } from "@/lib/workflows";
import { dispatchWebhooks } from "@/lib/webhooks";
import { computeProposalTotal, linesFromCatalog, signProposal } from "@/lib/proposals";
import { defaultEndAt } from "@/lib/calendar";
import { enqueueNotification } from "@/lib/notifications";
import { newId, nowIso, readStore, updateStore, writeStore } from "@/lib/store";
import type { KnockEvent, KnockProposal, KnockTerritory, Lead } from "@/lib/types";
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
    calendarEvents: data.knockCalendarEvents,
    notifications: data.notifications.slice(0, 30),
    gpsConfig: data.gpsConfig,
    webhookEndpoints: data.webhookEndpoints.map((e) => ({
      ...e,
      secret: e.secret.slice(0, 4) + "…",
    })),
    webhookDeliveries: data.webhookDeliveries.slice(0, 20),
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
      "sign_proposal",
      "create_calendar",
      "save_gps",
      "create_webhook",
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

    let knockId: string | null = null;
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
      knockId = knock.id;
    });

    if (duplicateWarning) {
      return NextResponse.json({ error: duplicateWarning, duplicate: true }, { status: 409 });
    }
    if (knockId) {
      const data = await readStore();
      await dispatchWebhooks(data, "pin.created", { knockId }, newId, nowIso);
      await writeStore(data);
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
    let territoryId: string | null = null;
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
      territoryId = territory.id;
      data.knockTerritories.unshift(territory);
      bound = bindPinsToTerritory(data, territory, newId, nowIso);
    });

    if (territoryId) {
      const data = await readStore();
      await dispatchWebhooks(data, "territory.created", { territoryId, pinsBound: bound }, newId, nowIso);
      await writeStore(data);
    }
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
      calendarEventId: null,
      reminderSentAt: null,
      completedAt: null,
      createdAt: nowIso(),
    };
    await updateStore((data) => {
      data.knockTodos.unshift(todo);
      enqueueNotification(
        data,
        {
          employeeId: todo.assignedToId,
          title: "New knocker task",
          body: todo.title,
          href: "/apps/knocker",
        },
        newId,
        nowIso,
      );
    });
    const data = await readStore();
    await dispatchWebhooks(data, "todo.created", { todoId: todo.id }, newId, nowIso);
    await writeStore(data);
    return NextResponse.json({ todo }, { status: 201 });
  }

  if (action === "complete_todo") {
    const id = z.string().parse(body.id);
    await updateStore((data) => {
      const t = data.knockTodos.find((x) => x.id === id);
      if (t) t.completedAt = nowIso();
    });
    const data = await readStore();
    await dispatchWebhooks(data, "todo.completed", { todoId: id }, newId, nowIso);
    await writeStore(data);
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
    let proposal: KnockProposal | null = null;
    let proposalId = "";
    await updateStore((data) => {
      const productIds = parsed.productIds ?? [];
      const serviceIds = parsed.serviceIds ?? [];
      const taxRate = Number(body.taxRate ?? 0);
      const extras = Array.isArray(body.extras) ? body.extras : [];
      const lineItems = linesFromCatalog(
        data.knockProducts,
        data.knockServices,
        productIds,
        serviceIds,
        extras,
      );
      const total = computeProposalTotal(lineItems, taxRate);
      proposal = {
        id: newId(),
        pinId: parsed.pinId,
        productIds,
        serviceIds,
        lineItems,
        total,
        taxRate,
        notes: String(body.notes ?? ""),
        status: "draft",
        signedAt: null,
        signatureDataUrl: null,
        signerName: null,
        signerEmail: null,
        appointmentAt: body.appointmentAt ? String(body.appointmentAt) : null,
        createdAt: nowIso(),
        createdById: parsed.createdById,
      };
      data.knockProposals.unshift(proposal);
      proposalId = proposal.id;
    });
    const data = await readStore();
    await dispatchWebhooks(data, "proposal.created", { proposalId }, newId, nowIso);
    await writeStore(data);
    return NextResponse.json({ proposal }, { status: 201 });
  }

  if (action === "sign_proposal") {
    const parsed = z
      .object({
        proposalId: z.string(),
        signerName: z.string().min(1),
        signerEmail: z.string().optional(),
        signatureDataUrl: z.string().min(20),
      })
      .parse(body);
    let signedId: string | null = null;
    await updateStore((data) => {
      const p = data.knockProposals.find((x) => x.id === parsed.proposalId);
      if (!p) return;
      Object.assign(
        p,
        signProposal(p, {
          signerName: parsed.signerName,
          signerEmail: parsed.signerEmail,
          signatureDataUrl: parsed.signatureDataUrl,
          nowIso: nowIso(),
        }),
      );
      signedId = p.id;
    });
    if (!signedId) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    const data = await readStore();
    await dispatchWebhooks(data, "proposal.signed", { proposalId: parsed.proposalId }, newId, nowIso);
    await writeStore(data);
    const proposal = data.knockProposals.find((p) => p.id === parsed.proposalId);
    return NextResponse.json({ proposal });
  }

  if (action === "create_calendar") {
    const parsed = z
      .object({
        title: z.string(),
        startAt: z.string(),
        endAt: z.string().optional(),
        location: z.string().optional(),
        description: z.string().optional(),
        pinId: z.string().nullable().optional(),
        todoId: z.string().nullable().optional(),
        employeeId: z.string(),
      })
      .parse(body);
    const ev = {
      id: newId(),
      title: parsed.title,
      startAt: parsed.startAt,
      endAt: parsed.endAt ?? defaultEndAt(parsed.startAt),
      location: parsed.location ?? "",
      description: parsed.description ?? "",
      pinId: parsed.pinId ?? null,
      todoId: parsed.todoId ?? null,
      employeeId: parsed.employeeId,
      icsUid: `${newId()}@bhcontracting.co`,
      googleEventId: null,
      createdAt: nowIso(),
    };
    await updateStore((data) => {
      data.knockCalendarEvents.unshift(ev);
      if (parsed.todoId) {
        const t = data.knockTodos.find((x) => x.id === parsed.todoId);
        if (t) t.calendarEventId = ev.id;
      }
    });
    return NextResponse.json({ event: ev }, { status: 201 });
  }

  if (action === "save_gps") {
    const parsed = z
      .object({
        distanceFilterMeters: z.number().min(5).max(500),
        desiredAccuracy: z.enum(["high", "balanced", "low"]),
        enabled: z.boolean(),
        wakeLock: z.boolean(),
      })
      .parse(body);
    await updateStore((data) => {
      data.gpsConfig = parsed;
    });
    return NextResponse.json({ gpsConfig: parsed });
  }

  if (action === "create_webhook") {
    const parsed = z
      .object({
        name: z.string(),
        url: z.string().url(),
        events: z.array(z.string()).optional(),
      })
      .parse(body);
    const endpoint = {
      id: newId(),
      name: parsed.name,
      url: parsed.url,
      secret: newId().replace(/-/g, ""),
      events: (parsed.events ?? ["pin.created", "proposal.signed"]) as Array<
        "pin.created" | "proposal.signed"
      >,
      enabled: true,
      createdAt: nowIso(),
    };
    await updateStore((data) => {
      data.webhookEndpoints.unshift(endpoint);
    });
    return NextResponse.json({ endpoint }, { status: 201 });
  }

  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
