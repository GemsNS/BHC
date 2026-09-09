/**
 * Seasonal snow packages for HRM — positioned from 2025–26 market comps:
 * - Platform / budget seasonal: ~$580–$960 (driveway-only, light coverage)
 * - Local premium seasonal: ~$1,200 driveway / ~$1,700 + salt / ~$2,600 full care
 * - Per-push residential: ~$45–$90 · commercial pushes: ~$180–$420
 *
 * BH rates sit mid-market: clearer than budget apps, sharper than top-end retainers.
 * Starting prices assume a typical single driveway in Halifax Regional Municipality;
 * oversized lots, steep grades, and multi-unit sites are confirmed on site.
 */

export type SnowPackageId = "driveway" | "home-shield" | "property-care" | "commercial";

export type SnowPackage = {
  id: SnowPackageId;
  name: string;
  eyebrow: string;
  priceLabel: string;
  priceNote: string;
  blurb: string;
  featured?: boolean;
  includes: readonly string[];
  trigger: string;
  bestFor: string;
};

export const SNOW_SEASON_LABEL = "2026–27 winter season";
export const SNOW_SERVICE_AREA =
  "Halifax, Dartmouth, Bedford, Sackville, and nearby HRM communities";

export const SNOW_PACKAGES: readonly SnowPackage[] = [
  {
    id: "driveway",
    name: "Driveway Guard",
    eyebrow: "Essential",
    priceLabel: "$999",
    priceNote: "per season · starting",
    blurb: "Keep the driveway open after every qualifying storm—priority for households that just need reliable plow coverage.",
    includes: [
      "Seasonal driveway clearing (Nov–Apr)",
      "Street-plow berm re-clear at the apron",
      "Photo completion notes after each visit",
      "Insured local crews across HRM routes",
    ],
    trigger: "Clears at 5 cm+",
    bestFor: "Standard single driveways",
  },
  {
    id: "home-shield",
    name: "Home Shield",
    eyebrow: "Most booked",
    priceLabel: "$1,549",
    priceNote: "per season · starting",
    blurb: "The HRM homeowner favourite—driveway, walk, and ice control so you can leave the house safely after every event.",
    featured: true,
    includes: [
      "Everything in Driveway Guard",
      "Primary walkway, stairs, and entrance clear",
      "Ice-melt application on cleared surfaces",
      "Lower 2 cm service trigger for early response",
      "Storm ETA texts for the property contact",
    ],
    trigger: "Clears at 2 cm+",
    bestFor: "Families & primary residences",
  },
  {
    id: "property-care",
    name: "Property Care",
    eyebrow: "Full cover",
    priceLabel: "$2,199",
    priceNote: "per season · starting",
    blurb: "Unlimited qualifying events with proactive ice management for larger homes, shared accesses, and higher liability surfaces.",
    includes: [
      "Everything in Home Shield",
      "Secondary walks / parking pad add-ons",
      "Priority first-wave dispatch in major storms",
      "No per-event volume caps on covered areas",
      "Season-end site review for next winter",
    ],
    trigger: "Clears at 2 cm+ · ice-first when needed",
    bestFor: "Larger lots & multi-access homes",
  },
  {
    id: "commercial",
    name: "Commercial Route",
    eyebrow: "Businesses",
    priceLabel: "Custom",
    priceNote: "seasonal or per-push",
    blurb: "Lots, entries, and sidewalk frontages quoted to footprint and SLA—aligned with HRM commercial push ranges and site liability.",
    includes: [
      "Parking lots, loading, and public entries",
      "Calibrated salt / treated blends",
      "Documented timestamps for claim support",
      "Optional overnight and weekend windows",
      "Per-push or flat seasonal contracts",
    ],
    trigger: "SLA trigger set in the agreement",
    bestFor: "Retail, offices, light industrial",
  },
] as const;

export const SNOW_ADD_ONS: readonly { title: string; detail: string }[] = [
  {
    title: "Per-visit driveway clear",
    detail: "From $65 when you are not on a seasonal plan (typical HRM single driveway).",
  },
  {
    title: "Walkway-only hand clear",
    detail: "From $45 per visit for stairs and primary paths.",
  },
  {
    title: "Ice-melt top-up",
    detail: "From $35 per application on Driveway Guard properties.",
  },
  {
    title: "Roof rake / hazard snow",
    detail: "Quoted after a site look—pitch and access vary widely in HRM.",
  },
];

export function snowPackageQuoteDetails(pkg: SnowPackage): string {
  return [
    `[Snow removal inquiry — ${pkg.name}]`,
    `Package: ${pkg.name} (${pkg.priceLabel} ${pkg.priceNote})`,
    `Season: ${SNOW_SEASON_LABEL}`,
    `Service area interest: ${SNOW_SERVICE_AREA}`,
    `Trigger: ${pkg.trigger}`,
    "",
    "Property address:",
    "Driveway / lot notes:",
    "Preferred contact window:",
  ].join("\n");
}
