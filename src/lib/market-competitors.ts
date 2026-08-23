/** Regional competitor intel — refreshed with market pulse jitter in API */
export type CompetitorSeed = {
  id: string;
  name: string;
  region: string;
  pricePerSqFt: number;
  rating: number;
  specialties: string[];
  note: string;
};

export const MARKET_COMPETITORS: CompetitorSeed[] = [
  {
    id: "comp-apex",
    name: "Apex Roof Systems",
    region: "Denver Metro",
    pricePerSqFt: 4.85,
    rating: 4.2,
    specialties: ["residential", "storm"],
    note: "Aggressive storm-season promos; watch door-knock overlap in Aurora.",
  },
  {
    id: "comp-summit",
    name: "Summit Exterior Co.",
    region: "Front Range",
    pricePerSqFt: 5.4,
    rating: 4.6,
    specialties: ["commercial", "metal"],
    note: "Premium positioning; slower close cycle on commercial bids.",
  },
  {
    id: "comp-rapid",
    name: "Rapid Shield Roofing",
    region: "Denver Metro",
    pricePerSqFt: 4.35,
    rating: 3.9,
    specialties: ["residential", "insurance"],
    note: "Undercuts on insurance jobs — verify margin before matching.",
  },
  {
    id: "comp-peak",
    name: "Peakline Contractors",
    region: "Boulder County",
    pricePerSqFt: 5.95,
    rating: 4.8,
    specialties: ["luxury", "solar-ready"],
    note: "High-end referrals; strong Google review velocity.",
  },
  {
    id: "comp-valley",
    name: "Valley Build & Roof",
    region: "Colorado Springs",
    pricePerSqFt: 4.65,
    rating: 4.1,
    specialties: ["residential", "gutters"],
    note: "Bundling gutters + roof; cross-sell pressure on south corridors.",
  },
  {
    id: "comp-northstar",
    name: "Northstar Exteriors",
    region: "Northern CO",
    pricePerSqFt: 5.1,
    rating: 4.4,
    specialties: ["commercial", "maintenance"],
    note: "Maintenance contracts growing — recurring revenue play.",
  },
];

export const MARKET_SYMBOLS: Array<{
  symbol: string;
  name: string;
  category: "commodity" | "sector" | "macro" | "internal";
  base: number;
}> = [
  { symbol: "LBR", name: "Lumber composite", category: "commodity", base: 612.4 },
  { symbol: "STL", name: "Steel scrap index", category: "commodity", base: 428.9 },
  { symbol: "DSL", name: "Diesel rack (reg)", category: "commodity", base: 3.84 },
  { symbol: "ITB", name: "Homebuilders ETF", category: "sector", base: 98.72 },
  { symbol: "XHB", name: "Home construction ETF", category: "sector", base: 104.18 },
  { symbol: "HG", name: "Copper futures", category: "commodity", base: 4.12 },
  { symbol: "MORT", name: "30Y mortgage rate", category: "macro", base: 6.82 },
  { symbol: "BHC-PIPE", name: "BHC pipeline value", category: "internal", base: 0 },
  { symbol: "BHC-FUEL", name: "BHC fuel spend/mo", category: "internal", base: 0 },
  { symbol: "BHC-KNOCK", name: "Knocks today", category: "internal", base: 0 },
];
