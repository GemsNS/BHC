/**
 * Relational option sets for the exterior configurator (research-backed summaries).
 * UI enforces paint vs stain, thermal-break prompts, and palette binding by material.
 */

export type TabId = "siding" | "windows" | "doors";

export const SIDING_MATERIALS = [
  {
    id: "premium-vinyl",
    label: "Premium vinyl",
    note: "Multi-chamber extrusions, high wind ratings, low maintenance — strong Maritimes choice.",
  },
  {
    id: "fiber-cement-hardie",
    label: "Fiber cement (e.g. James Hardie)",
    note: "ColorPlus / factory-cured systems; salt & moisture resilient.",
  },
  {
    id: "composite",
    label: "Composite cladding",
    note: "Wood-like embossing with polymer durability.",
  },
  {
    id: "metal",
    label: "Aluminum / steel siding",
    note: "Impact-rated steel or roll-formed aluminum; specialty coatings.",
  },
] as const;

export type SidingMaterialId = (typeof SIDING_MATERIALS)[number]["id"];

export const SIDING_PROFILES = [
  { id: "lap", label: "Clapboard / lap", hint: "D4 / D5 exposures" },
  { id: "dutch-lap", label: "Dutch lap", hint: "Bevelled shadow line" },
  { id: "board-batten", label: "Board & batten", hint: "Vertical modern farmhouse" },
  { id: "shake", label: "Shake / shingle", hint: "Accent or full façade" },
  { id: "smooth", label: "Smooth panel", hint: "Contemporary flat" },
] as const;

/** James Hardie Statement Collection — hex from research */
export const JAMES_HARDIE_COLORS = [
  { name: "Arctic White", hex: "#F1F2ED" },
  { name: "Deep Ocean", hex: "#49525B" },
  { name: "Iron Gray", hex: "#5A5B5D" },
  { name: "Evening Blue", hex: "#3A4A5A" },
  { name: "Boothbay Blue", hex: "#6D7B85" },
  { name: "Navajo Beige", hex: "#D4C6B3" },
  { name: "Cobble Stone", hex: "#C1B8A6" },
  { name: "Seclusion", hex: "#9DA293" },
] as const;

/** Gentek “Classic / Designer” sample mapping (hex approximations for UI) */
export const GENTEK_SAMPLE_COLORS = [
  { name: "Snow White", hex: "#F4F6F5" },
  { name: "Canyon Clay", hex: "#B89E88" },
  { name: "Dover Gray", hex: "#8E9693" },
  { name: "Midnight Surf", hex: "#1E2D3A" },
  { name: "Hudson Slate", hex: "#4A4F52" },
  { name: "Coastal Blue", hex: "#3B6F8F" },
] as const;

export const WINDOW_STYLES = [
  { id: "casement", label: "Casement", note: "Outswing; strong weather seal — coastal favourite." },
  { id: "awning", label: "Awning", note: "Top-hinged; rain-shedding ventilation." },
  { id: "single-hung", label: "Single hung", note: "Traditional; space-saving." },
  { id: "double-hung", label: "Double hung", note: "Dual sash; tilt-in cleaning." },
  { id: "glider", label: "Slider / glider", note: "Wide openings; deck-facing." },
  { id: "tilt-turn", label: "Tilt & turn", note: "European dual-action." },
  { id: "fixed", label: "Fixed / picture", note: "Max glass; best U-factor." },
  { id: "custom-shape", label: "Custom shape", note: "Half-round, trapezoid, etc." },
] as const;

export const WINDOW_FRAMES = [
  { id: "vinyl", label: "PVC / vinyl", thermalBreak: false },
  { id: "fiberglass", label: "Fiberglass", thermalBreak: false },
  { id: "aluminum", label: "Aluminum", thermalBreak: true },
  { id: "wood", label: "Solid wood", thermalBreak: false },
  { id: "wood-clad", label: "Wood-clad (ext. metal/fiberglass)", thermalBreak: false },
] as const;

export const GLAZING_PACKAGES = [
  { id: "double-lowe-argon", label: "Double-pane, Low-E, Argon fill" },
  { id: "triple-lowe-argon", label: "Triple-pane, Low-E, Argon (cold climate)" },
  { id: "double-clear", label: "Double-pane clear (budget / service)" },
] as const;

export const WINDOW_HARDWARE = [
  { id: "multi-point", label: "Multi-point locking" },
  { id: "standard", label: "Standard latch" },
] as const;

export const DOOR_SYSTEMS = [
  { id: "single", label: "Single entry" },
  { id: "double", label: "Double entry (French)" },
  { id: "sidelites", label: "Single + sidelite(s)" },
  { id: "transom", label: "Door + transom / sidelite combo" },
  { id: "garden", label: "Garden / terrace door" },
  { id: "patio-slider", label: "Sliding patio door" },
  { id: "lift-slide", label: "Lift & slide (large span)" },
] as const;

export const DOOR_SUBSTRATES = [
  { id: "steel", label: "Steel (foam core)", finishes: ["paint"] as const },
  { id: "smooth-fiberglass", label: "Smooth fiberglass", finishes: ["paint"] as const },
  {
    id: "textured-fiberglass",
    label: "Textured fiberglass (woodgrain)",
    finishes: ["paint", "stain"] as const,
  },
  { id: "solid-wood", label: "Solid wood", finishes: ["paint", "stain"] as const },
  { id: "pvc", label: "All-PVC swing", finishes: ["paint"] as const },
  { id: "composite", label: "Composite / hybrid", finishes: ["paint"] as const },
] as const;

export type DoorSubstrateId = (typeof DOOR_SUBSTRATES)[number]["id"];

export const DOOR_GLASS_LITES = [
  { id: "flush", label: "Flush / no glass" },
  { id: "quarter", label: "1/4 lite" },
  { id: "half", label: "1/2 lite" },
  { id: "three-quarter", label: "3/4 lite" },
  { id: "full", label: "Full lite" },
] as const;

export const PAINT_FINISHES = [
  "White",
  "Black / Charcoal",
  "Iron ore",
  "Navy / Wedgewood",
  "Sage / forest",
  "Warm taupe / greige",
  "Custom (specify in notes)",
] as const;

export const STAIN_FINISHES = [
  "Pecan / natural",
  "Cherry / chestnut",
  "Walnut / espresso",
  "Dark oak / mahogany",
  "Custom (specify in notes)",
] as const;

export const HARDWARE_FINISHES = [
  "Satin nickel",
  "Black",
  "Oil-rubbed bronze",
  "Stainless / dull chrome",
  "Polished brass",
] as const;

export function doorAllowsStain(substrateId: DoorSubstrateId): boolean {
  const s = DOOR_SUBSTRATES.find((x) => x.id === substrateId);
  return s ? [...s.finishes].includes("stain") : false;
}

export function doorFinishOptions(substrateId: DoorSubstrateId): ("paint" | "stain")[] {
  const s = DOOR_SUBSTRATES.find((x) => x.id === substrateId);
  return s ? [...s.finishes] : ["paint"];
}
