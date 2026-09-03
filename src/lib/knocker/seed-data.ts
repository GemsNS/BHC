import { DEFAULT_KNOCK_COLORS } from "./colors";
import type {
  KnockProduct,
  KnockService,
  KnockTag,
  KnockTerritory,
  KnockTodo,
} from "@/lib/types";

export function buildKnockerSeed(iso: (daysAgo: number, hour?: number) => string) {
  const knockTags: KnockTag[] = [
    { id: "tag-roof", label: "Roof type: asphalt", color: "#64748b" },
    { id: "tag-hail", label: "Hail damage", color: "#ef4444" },
    { id: "tag-competitor", label: "Competitor sign", color: "#f97316" },
    { id: "tag-solar", label: "Solar potential", color: "#eab308" },
    { id: "tag-deck", label: "Deck project", color: "#22c55e" },
  ];

  const knockProducts: KnockProduct[] = [
    { id: "prod-deck", name: "Composite deck package", sku: "DK-100", unitPrice: 18500, category: "Decks" },
    { id: "prod-roof", name: "Architectural shingle roof", sku: "RF-200", unitPrice: 24000, category: "Roofing" },
    { id: "prod-siding", name: "Fiber cement siding", sku: "SD-300", unitPrice: 32000, category: "Envelope" },
  ];

  const knockServices: KnockService[] = [
    { id: "svc-estimate", name: "On-site estimate", description: "Free property walkthrough", basePrice: 0 },
    { id: "svc-insurance", name: "Insurance claim assist", description: "Documentation + adjuster prep", basePrice: 450 },
    { id: "svc-maintenance", name: "Annual maintenance plan", description: "Seasonal inspections", basePrice: 899 },
  ];

  const knockTerritories: KnockTerritory[] = [
    {
      id: "turf-1",
      name: "Harbor Lane north loop",
      zoneId: "zone-1",
      polygon: [
        [36.975, -122.031],
        [36.975, -122.027],
        [36.973, -122.027],
        [36.973, -122.031],
      ],
      colorHex: "#ff2a2a",
      fillOpacity: 0.22,
      assignedRepIds: ["emp-knocker-1"],
      createdAt: iso(10),
      updatedAt: iso(10),
    },
  ];

  const knockTodos: KnockTodo[] = [
    {
      id: "todo-1",
      pinId: "knock-1",
      title: "Call back — deck pricing",
      body: "Homeowner asked for written estimate by Friday.",
      dueAt: iso(-2, 17),
      priority: "high" as const,
      assignedToId: "emp-knocker-1",
      completedAt: null,
      createdAt: iso(0, 13),
      calendarEventId: "cal-1",
      reminderSentAt: null,
    },
  ];

  return {
    knockTags,
    knockProducts,
    knockServices,
    knockTerritories,
    knockTodos,
    knockProposals: [],
    knockChat: [
      {
        id: "chat-1",
        channelId: "team-field",
        authorId: "emp-knocker-1",
        body: "Harbor Lane north — 3 interested, 1 appointment set.",
        imageDataUrl: null,
        sharedPinId: null,
        createdAt: iso(0, 14),
      },
    ],
    knockRepLocations: [],
    knockColorCodes: DEFAULT_KNOCK_COLORS,
    knockCalendarEvents: [
      {
        id: "cal-1",
        title: "Callback — 16 Harbor Lane",
        startAt: iso(-2, 17),
        endAt: iso(-2, 18),
        location: "16 Harbor Lane, Seaside",
        description: "Deck pricing follow-up",
        pinId: "knock-1",
        todoId: "todo-1",
        employeeId: "emp-knocker-1",
        icsUid: "cal-1@bhcontracting.ca",
        googleEventId: null,
        createdAt: iso(0, 13),
      },
    ],
    webhookEndpoints: [],
    webhookDeliveries: [],
    pushSubscriptions: [],
    notifications: [],
    gpsConfig: {
      distanceFilterMeters: 25,
      desiredAccuracy: "balanced" as const,
      enabled: true,
      wakeLock: true,
    },
  };
}
