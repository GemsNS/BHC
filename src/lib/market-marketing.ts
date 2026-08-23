/** Marketing & intel extensions for the market command terminal */

export type EquipmentEconomics = {
  id: string;
  name: string;
  category: string;
  rentalPerDay: number;
  purchasePrice: number;
  breakEvenDays: number;
  utilizationPct: number;
  verdict: "rent" | "buy" | "either";
  note: string;
};

export type MarketplaceListing = {
  id: string;
  title: string;
  region: string;
  price: number;
  unit: string;
  postedAgo: string;
  sellerType: string;
  competitorMatch?: string;
  tone: "deal" | "premium" | "neutral";
  url: string;
};

export type AdDraft = {
  id: string;
  channel: "facebook" | "google" | "nextdoor" | "instagram";
  headline: string;
  body: string;
  cta: string;
  status: "draft" | "ready" | "scheduled";
  scheduledFor?: string;
};

export type MarketingTool = {
  id: string;
  name: string;
  description: string;
  href?: string;
  badge?: string;
};

export type MarketingIntel = {
  equipment: EquipmentEconomics[];
  marketplace: MarketplaceListing[];
  adDrafts: AdDraft[];
  tools: MarketingTool[];
  assistantSummary: string;
};

const EQUIPMENT_BASE: Omit<EquipmentEconomics, "breakEvenDays" | "utilizationPct" | "verdict">[] = [
  {
    id: "lift-45",
    name: "45' boom lift",
    category: "Access",
    rentalPerDay: 285,
    purchasePrice: 42000,
    note: "Storm-season demand spikes — rent unless >60% utilization.",
  },
  {
    id: "comp-90",
    name: "90cfm compressor + nailers",
    category: "Roofing",
    rentalPerDay: 95,
    purchasePrice: 6800,
    note: "Buy pays back fast on multi-crew shingle weeks.",
  },
  {
    id: "dump-20",
    name: "20yd roll-off (weekly)",
    category: "Haul-off",
    rentalPerDay: 420,
    purchasePrice: 8500,
    note: "Rent per job; buy truck + bins only at 8+ pulls/month.",
  },
  {
    id: "scaff-sys",
    name: "System scaffold (per bay-week)",
    category: "Envelope",
    rentalPerDay: 180,
    purchasePrice: 24000,
    note: "Commercial phased jobs favor rental; repeat storefronts favor buy.",
  },
];

const MARKETPLACE_SEED: Omit<MarketplaceListing, "price" | "postedAgo">[] = [
  {
    id: "fb-1",
    title: "Roof replacement — architectural shingles (850 sqft)",
    region: "Denver Metro",
    unit: "job",
    sellerType: "Owner",
    competitorMatch: "Summit Roof Co",
    tone: "deal",
    url: "https://www.facebook.com/marketplace/",
  },
  {
    id: "fb-2",
    title: "Commercial TPO re-roof — warehouse bay",
    region: "Aurora",
    unit: "sqft",
    sellerType: "Property mgr",
    tone: "premium",
    url: "https://www.facebook.com/marketplace/",
  },
  {
    id: "fb-3",
    title: "Storm damage repair — insurance scope ready",
    region: "Broomfield",
    unit: "job",
    sellerType: "Contractor resale",
    competitorMatch: "Front Range Exteriors",
    tone: "neutral",
    url: "https://www.facebook.com/marketplace/",
  },
  {
    id: "fb-4",
    title: "Gutter + fascia bundle — whole home",
    region: "Lakewood",
    unit: "job",
    sellerType: "Owner",
    tone: "deal",
    url: "https://www.facebook.com/marketplace/",
  },
  {
    id: "fb-5",
    title: "Metal standing seam — shop building",
    region: "Fort Collins",
    unit: "sqft",
    sellerType: "Owner",
    competitorMatch: "Peak Shield Roofing",
    tone: "premium",
    url: "https://www.facebook.com/marketplace/",
  },
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function jitter(base: number, id: string, pct: number, now: number): number {
  const w = Math.sin(now / 600000 + hashStr(id)) * pct;
  return base * (1 + w);
}

export function buildMarketingIntel(now = Date.now()): MarketingIntel {
  const equipment: EquipmentEconomics[] = EQUIPMENT_BASE.map((e) => {
    const utilizationPct = 35 + (hashStr(e.id) % 45);
    const breakEvenDays = Math.round(e.purchasePrice / e.rentalPerDay);
    const verdict: EquipmentEconomics["verdict"] =
      utilizationPct >= 55 ? "buy" : utilizationPct <= 38 ? "rent" : "either";
    return { ...e, breakEvenDays, utilizationPct, verdict };
  });

  const marketplace: MarketplaceListing[] = MARKETPLACE_SEED.map((m, i) => ({
    ...m,
    price: jitter(m.unit === "sqft" ? 4.85 : 12800, m.id, 0.08, now + i * 1000),
    postedAgo: `${1 + (hashStr(m.id) % 48)}h ago`,
  }));

  const adDrafts: AdDraft[] = [
    {
      id: "ad-1",
      channel: "facebook",
      headline: "Hail season prep — free roof inspection",
      body: "Big Hoss crews are scheduling Denver Metro inspections this week. Photo report + insurance-ready scope in 24h.",
      cta: "Book inspection",
      status: "ready",
    },
    {
      id: "ad-2",
      channel: "google",
      headline: "Commercial envelope crews — phased scheduling",
      body: "Minimize tenant disruption. TPO, mod-bit, and storefront metal. Ask for our portfolio packet.",
      cta: "Request bid package",
      status: "scheduled",
      scheduledFor: "Mon 8:00 AM",
    },
    {
      id: "ad-3",
      channel: "nextdoor",
      headline: "Neighbor referral — $250 credit",
      body: "Refer a roof replacement in your subdivision. Credit applies when their job completes.",
      cta: "Share offer",
      status: "draft",
    },
  ];

  const tools: MarketingTool[] = [
    {
      id: "tool-mainframe",
      name: "Mainframe ad assistant",
      description: "Generate and queue campaigns from live pipeline + market signals.",
      href: "/admin/assistant",
      badge: "AI",
    },
    {
      id: "tool-outreach",
      name: "Outreach sequences",
      description: "Approve and send prospecting emails with hunt criteria gates.",
      href: "/admin/sales?tab=outreach",
    },
    {
      id: "tool-canvass",
      name: "Canvassing heatmap",
      description: "Door-knock zones tied to storm paths and competitor density.",
      href: "/admin/canvass",
    },
    {
      id: "tool-stats",
      name: "Conversion analytics",
      description: "Lead source ROI, close rates, and CAC vs market benchmarks.",
      href: "/admin/stats",
    },
    {
      id: "tool-portal",
      name: "Customer portal",
      description: "Public job status page for homeowners and property managers.",
      href: "/portal",
    },
  ];

  const avgCompetitor =
    marketplace.filter((m) => m.unit === "sqft").reduce((s, m) => s + m.price, 0) /
    Math.max(1, marketplace.filter((m) => m.unit === "sqft").length);

  return {
    equipment,
    marketplace,
    adDrafts,
    tools,
    assistantSummary: `Auto-ad assistant recommends a Facebook hail-prep push and Google commercial bid package. FB marketplace avg ~$${avgCompetitor.toFixed(2)}/sqft — ${avgCompetitor > 5 ? "premium" : "competitive"} vs our pipeline targets.`,
  };
}
