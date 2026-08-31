"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Info } from "lucide-react";
import { Reveal } from "@/components/site/motion/Reveal";
import { HousePreview } from "@/components/site/exterior/HousePreview";
import { Switch } from "@/components/site/ui/Switch";
import type { PricingItem } from "@/lib/site/pricingData";
import {
  type DoorSubstrateId,
  type SidingMaterialId,
  type TabId,
  DOOR_GLASS_LITES,
  DOOR_SUBSTRATES,
  DOOR_SYSTEMS,
  GENTEK_SAMPLE_COLORS,
  GLAZING_PACKAGES,
  HARDWARE_FINISHES,
  JAMES_HARDIE_COLORS,
  PAINT_FINISHES,
  SIDING_MATERIALS,
  SIDING_PROFILES,
  STAIN_FINISHES,
  WINDOW_FRAMES,
  WINDOW_HARDWARE,
  WINDOW_STYLES,
  doorAllowsStain,
  doorFinishOptions,
} from "@/lib/site/exteriorConfiguratorData";

const SHOW_DESIGNER_KEY = "bhc-show-exterior-designer";

const TABS: { id: TabId; label: string; short: string }[] = [
  { id: "siding", label: "Siding & cladding", short: "Siding" },
  { id: "windows", label: "Windows & glazing", short: "Windows" },
  { id: "doors", label: "Doors & entry", short: "Doors" },
];

const GENERIC_SWATCHES = ["#5A6B7C", "#8B9C8E", "#C4B8A0", "#E8E4DC", "#2D3E50", "#00B4D8"];
const QUOTE_STORAGE_KEY = "bhcExteriorQuote";

type EstimateLine = {
  item: string;
  coverage: string;
  cost: string;
  wasteFactor: string;
  unitRate: number;
  quantity: number;
};

type ExteriorDesignerProps = {
  pricingItems: PricingItem[];
};

const TAB_MATCHERS: Record<TabId, string[]> = {
  siding: [
    "siding",
    "hardie",
    "canexcel",
    "maibec",
    "cellular",
    "distinction",
    "steel",
    "strapping",
    "tyvek",
    "insulation",
    "soffit",
    "fascia",
    "drip flashing",
    "wall flashing",
    "shake",
    "trim",
    "batton",
    "batten",
  ],
  windows: ["window", "glazing", "capping", "flashing"],
  doors: ["door", "entry", "garage door"],
};

function sidingPatternCss(
  profileId: (typeof SIDING_PROFILES)[number]["id"],
): string {
  switch (profileId) {
    case "lap":
      return "repeating-linear-gradient(to bottom, rgba(0,0,0,0.14) 0px, rgba(0,0,0,0.14) 1px, transparent 1px, transparent 13px)";
    case "dutch-lap":
      return "repeating-linear-gradient(to bottom, rgba(0,0,0,0.2) 0px, rgba(0,0,0,0.2) 3px, transparent 3px, transparent 14px)";
    case "board-batten":
      return "repeating-linear-gradient(to right, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 15px)";
    case "shake":
      return "repeating-linear-gradient(135deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 1px, transparent 1px, transparent 7px)";
    case "smooth":
    default:
      return "none";
  }
}

function parseRate(cost: string): number {
  const values = [...cost.matchAll(/\$?\s*(\d+(?:\.\d+)?)/g)]
    .map((m) => Number.parseFloat(m[1]))
    .filter((n) => Number.isFinite(n));
  if (!values.length) return 0;
  if (values.length === 1) return values[0];
  return (values[0] + values[values.length - 1]) / 2;
}

function parseWasteRate(wasteFactor: string): number {
  const cleaned = wasteFactor.replace("%", "").trim();
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

function matchesTab(item: PricingItem, tab: TabId): boolean {
  const haystack = `${item.item} ${item.coverage}`.toLowerCase();
  return TAB_MATCHERS[tab].some((needle) => haystack.includes(needle));
}

function safeNumber(value: string, fallback = 0): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

export function ExteriorDesigner({ pricingItems }: ExteriorDesignerProps) {
  const [showDesigner, setShowDesigner] = useState(true);
  const [tab, setTab] = useState<TabId>("siding");
  const [coastalMode, setCoastalMode] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(SHOW_DESIGNER_KEY) === "0") {
        setShowDesigner(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistShowDesigner = useCallback((next: boolean) => {
    setShowDesigner(next);
    try {
      localStorage.setItem(SHOW_DESIGNER_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const [sidingMaterial, setSidingMaterial] = useState<SidingMaterialId>("fiber-cement-hardie");
  const [sidingProfile, setSidingProfile] =
    useState<(typeof SIDING_PROFILES)[number]["id"]>("lap");
  const [sidingColor, setSidingColor] = useState<string>(JAMES_HARDIE_COLORS[1].hex);
  const [sidingColorName, setSidingColorName] = useState<string>(JAMES_HARDIE_COLORS[1].name);
  const [roofTrimColor, setRoofTrimColor] = useState("#FFFFFF");

  const [windowStyle, setWindowStyle] = useState<(typeof WINDOW_STYLES)[number]["id"]>(
    WINDOW_STYLES[0].id,
  );
  const [windowFrame, setWindowFrame] = useState<(typeof WINDOW_FRAMES)[number]["id"]>("vinyl");
  const [glazing, setGlazing] = useState<(typeof GLAZING_PACKAGES)[number]["id"]>(
    GLAZING_PACKAGES[0].id,
  );
  const [winHardware, setWinHardware] = useState<(typeof WINDOW_HARDWARE)[number]["id"]>(
    "multi-point",
  );
  const [windowFrameExteriorColor, setWindowFrameExteriorColor] = useState("#1c1c1c");
  const [windowGlassColor, setWindowGlassColor] = useState("#DCEEF5");

  const [doorSystem, setDoorSystem] = useState<(typeof DOOR_SYSTEMS)[number]["id"]>(
    DOOR_SYSTEMS[0].id,
  );
  const [doorSubstrate, setDoorSubstrate] = useState<DoorSubstrateId>("textured-fiberglass");
  const [doorLite, setDoorLite] = useState<(typeof DOOR_GLASS_LITES)[number]["id"]>(
    DOOR_GLASS_LITES[0].id,
  );
  const [doorFinishType, setDoorFinishType] = useState<"paint" | "stain">("paint");
  const [doorColorLabel, setDoorColorLabel] = useState<string>(PAINT_FINISHES[1]);
  const [doorStainLabel, setDoorStainLabel] = useState<string>(STAIN_FINISHES[2]);
  const [doorPanelColor, setDoorPanelColor] = useState("#2a2a2a");
  const [entryHardwareFinish, setEntryHardwareFinish] = useState<string>(HARDWARE_FINISHES[1]);
  const [smartLock, setSmartLock] = useState(false);
  const [estimateLines, setEstimateLines] = useState<EstimateLine[]>([]);
  const [selectedRateItem, setSelectedRateItem] = useState("");
  const [wallWidthFt, setWallWidthFt] = useState("24");
  const [wallHeightFt, setWallHeightFt] = useState("9");
  const [wallCount, setWallCount] = useState("1");
  const [linearFeet, setLinearFeet] = useState("80");
  const [openingCount, setOpeningCount] = useState("1");

  const pattern = useMemo(() => sidingPatternCss(sidingProfile), [sidingProfile]);

  useEffect(() => {
    if (!doorAllowsStain(doorSubstrate) && doorFinishType === "stain") {
      setDoorFinishType("paint");
    }
  }, [doorSubstrate, doorFinishType]);

  const thermalBreakNote = windowFrame === "aluminum";

  const hardieMode = sidingMaterial === "fiber-cement-hardie";
  const gentekMode = sidingMaterial === "premium-vinyl";

  const sidingPalette = useMemo(() => {
    if (hardieMode) return [...JAMES_HARDIE_COLORS];
    if (gentekMode) return [...GENTEK_SAMPLE_COLORS];
    return GENERIC_SWATCHES.map((hex) => ({ name: "Custom swatch", hex }));
  }, [hardieMode, gentekMode]);

  const tabRateOptions = useMemo(
    () =>
      pricingItems
        .filter((item) => matchesTab(item, tab))
        .sort((a, b) => a.item.localeCompare(b.item)),
    [pricingItems, tab],
  );

  useEffect(() => {
    if (!tabRateOptions.length) {
      setSelectedRateItem("");
      return;
    }
    setSelectedRateItem((prev) =>
      prev && tabRateOptions.some((item) => item.item === prev) ? prev : tabRateOptions[0].item,
    );
  }, [tabRateOptions]);

  const scopedAreaSqFt = Math.max(0, safeNumber(wallWidthFt) * safeNumber(wallHeightFt) * safeNumber(wallCount, 1));

  const estimatedQuantityForUnit = useCallback(
    (unitRaw: string) => {
      const unit = unitRaw.trim().toLowerCase();
      if (unit === "sq") return scopedAreaSqFt / 100;
      if (unit === "ft") return Math.max(0, safeNumber(linearFeet));
      if (unit === "door" || unit === "pair" || unit === "pc") return Math.max(0, safeNumber(openingCount, 1));
      return 1;
    },
    [linearFeet, openingCount, scopedAreaSqFt],
  );

  const estimateSummaryBlock = useMemo(() => {
    if (!estimateLines.length) return "";
    const lines = [
      "",
      "── SCOPE LINES (FOR QUOTE REQUEST — NO PUBLIC PRICING) ──",
      `Assumptions: ${safeNumber(wallWidthFt)}ft x ${safeNumber(wallHeightFt)}ft x ${safeNumber(wallCount, 1)} wall(s), ${safeNumber(linearFeet)} linear ft, ${safeNumber(openingCount, 1)} opening(s)`,
      ...estimateLines.map((line) => {
        return `${line.item}: ${line.quantity.toFixed(2)} ${line.coverage.toUpperCase()} (waste factor ${line.wasteFactor || "0%"})`;
      }),
      "Formal pricing is prepared internally after site review.",
    ];
    return lines.join("\n");
  }, [estimateLines, linearFeet, openingCount, wallCount, wallHeightFt, wallWidthFt]);

  const summary = useMemo(() => {
    const lines: string[] = [
      "[Exterior configuration — BH Contracting LTD. website]",
      "",
      "── SIDING ──",
      `Material: ${SIDING_MATERIALS.find((m) => m.id === sidingMaterial)?.label ?? sidingMaterial}`,
      `Profile: ${SIDING_PROFILES.find((p) => p.id === sidingProfile)?.label ?? sidingProfile}`,
      `Colour: ${sidingColorName} (${sidingColor})`,
      `Roof / rake trim (preview): ${roofTrimColor}`,
      "",
      "── WINDOWS ──",
      `Style: ${WINDOW_STYLES.find((w) => w.id === windowStyle)?.label}`,
      `Frame: ${WINDOW_FRAMES.find((f) => f.id === windowFrame)?.label}`,
      thermalBreakNote ? "Note: Aluminum frame — thermal break required (code)." : "",
      `Glazing: ${GLAZING_PACKAGES.find((g) => g.id === glazing)?.label}`,
      `Hardware: ${WINDOW_HARDWARE.find((h) => h.id === winHardware)?.label}`,
      `Frame colour (exterior preview): ${windowFrameExteriorColor}`,
      `Glass tint (preview): ${windowGlassColor}`,
      "",
      "── DOORS ──",
      `System: ${DOOR_SYSTEMS.find((d) => d.id === doorSystem)?.label}`,
      `Slab material: ${DOOR_SUBSTRATES.find((d) => d.id === doorSubstrate)?.label}`,
      `Glass proportion: ${DOOR_GLASS_LITES.find((l) => l.id === doorLite)?.label}`,
      `Finish: ${doorFinishType === "paint" ? "Paint — " + doorColorLabel : "Stain — " + doorStainLabel}`,
      `Hardware finish: ${entryHardwareFinish}`,
      smartLock ? "Upgrade: Smart / keyless lock interest" : "",
      "",
      coastalMode
        ? "── COASTAL NS ── Prioritize marine-grade hardware, high DP glazing, salt-tolerant cladding where applicable."
        : "",
      estimateSummaryBlock,
      "",
      "Please prepare a quote from these selections (subject to site measure & code).",
    ];
    return lines.filter(Boolean).join("\n");
  }, [
    sidingMaterial,
    sidingProfile,
    sidingColor,
    sidingColorName,
    roofTrimColor,
    windowStyle,
    windowFrame,
    glazing,
    winHardware,
    windowFrameExteriorColor,
    windowGlassColor,
    doorSystem,
    doorSubstrate,
    doorLite,
    doorFinishType,
    doorColorLabel,
    doorStainLabel,
    entryHardwareFinish,
    smartLock,
    coastalMode,
    thermalBreakNote,
    estimateSummaryBlock,
  ]);

  const addEstimateLine = useCallback(() => {
    const source = tabRateOptions.find((item) => item.item === selectedRateItem);
    if (!source) return;
    const unitRate = parseRate(source.cost);
    if (unitRate <= 0) return;
    setEstimateLines((prev) => {
      if (prev.some((line) => line.item === source.item)) return prev;
      return [
        ...prev,
        {
          item: source.item,
          coverage: source.coverage,
          cost: source.cost,
          wasteFactor: source.wasteFactor,
          unitRate,
          quantity: Math.max(0.01, estimatedQuantityForUnit(source.coverage)),
        },
      ];
    });
  }, [estimatedQuantityForUnit, selectedRateItem, tabRateOptions]);

  const applyDimensionQuantities = useCallback(() => {
    setEstimateLines((prev) =>
      prev.map((line) => ({
        ...line,
        quantity: Math.max(0.01, estimatedQuantityForUnit(line.coverage)),
      })),
    );
  }, [estimatedQuantityForUnit]);

  const applyToQuote = useCallback(() => {
    try {
      sessionStorage.setItem(
        QUOTE_STORAGE_KEY,
        JSON.stringify({
          summary,
          tab,
          sidingMaterial,
          sidingProfile,
          windowStyle,
          doorSystem,
        }),
      );
    } catch {
      /* ignore */
    }
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
    window.dispatchEvent(new Event("bhc-quote-prefill"));
  }, [summary, tab, sidingMaterial, sidingProfile, windowStyle, doorSystem]);

  return (
    <section
      id="exterior-design"
      className="scroll-mt-32 border-t border-zinc-200/80 bg-white pt-10 pb-16 sm:scroll-mt-36 sm:pt-12 sm:pb-20"
      aria-labelledby="exterior-design-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal y={22}>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">
            Interactive configurator
          </p>
          <h2
            id="exterior-design-heading"
            className="mt-4 text-3xl font-bold tracking-tight text-base-black sm:text-4xl lg:text-[2.35rem] lg:leading-snug"
          >
            Design your exterior
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-600 sm:text-lg">
            Configure <strong>siding</strong>, <strong>windows</strong>, and <strong>doors</strong> with
            spec-level options informed by coastal build practice. Add optional scope lines to describe
            quantities—rates stay internal and appear only in your formal estimate. Everything compiles
            into one quote request you can edit before sending.
          </p>
        </Reveal>

        <div className="mt-8 flex flex-col gap-3 rounded-sm border border-zinc-200 bg-zinc-50/90 px-4 py-4 transition-shadow duration-300 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p id="exterior-designer-toggle-label" className="text-sm font-semibold text-base-black">
              Show exterior designer
            </p>
            <p className="mt-0.5 text-xs text-base-black/55">
              Turn off if you only need a quote for other work—use the contact form below and choose
              &quot;Other services.&quot;
            </p>
          </div>
          <Switch
            id="exterior-designer-toggle"
            checked={showDesigner}
            onCheckedChange={persistShowDesigner}
            aria-labelledby="exterior-designer-toggle-label"
          />
        </div>

        {showDesigner ? (
          <>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-base-black/10 bg-base-white/80 px-4 py-3 text-sm text-base-black/80">
          <input
            type="checkbox"
            checked={coastalMode}
            onChange={(e) => setCoastalMode(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-base-black/20 text-primary-aqua focus:ring-primary-aqua"
          />
          <span>
            <span className="font-semibold text-base-black">Coastal Nova Scotia priorities</span>
            <span className="mt-0.5 block text-xs text-base-black/55">
              Surfaces salt-spray, wind load, and moisture themes in your summary for Halifax /
              HRM–style quoting.
            </span>
          </span>
        </label>

        <div
          className="mt-8 flex flex-wrap gap-2 border-b border-base-black/10 pb-3"
          role="tablist"
          aria-label="Configurator sections"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? "bg-base-black text-base-white"
                  : "bg-base-white text-base-black/70 ring-1 ring-base-black/10 hover:bg-base-black/5"
              }`}
            >
              {t.short}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:items-start lg:gap-8">
          <div className="min-h-0 space-y-8 lg:col-span-7">
            {tab === "siding" ? (
              <div className="space-y-8">
                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-wide text-base-black/55">
                    Cladding material
                  </legend>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {SIDING_MATERIALS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSidingMaterial(m.id);
                          if (m.id === "fiber-cement-hardie") {
                            const c = JAMES_HARDIE_COLORS[1];
                            setSidingColor(c.hex);
                            setSidingColorName(c.name);
                          }
                          if (m.id === "premium-vinyl") {
                            const c = GENTEK_SAMPLE_COLORS[2];
                            setSidingColor(c.hex);
                            setSidingColorName(`${c.name} (Gentek-style)`);
                          }
                        }}
                        className={`rounded-lg border px-3 py-3 text-left text-sm ${
                          sidingMaterial === m.id
                            ? "border-primary-aqua bg-primary-aqua/10"
                            : "border-base-black/10 bg-base-white hover:border-base-black/18"
                        }`}
                      >
                        <span className="font-semibold text-base-black">{m.label}</span>
                        <span className="mt-1 block text-xs text-base-black/55">{m.note}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-wide text-base-black/55">
                    Architectural profile
                  </legend>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {SIDING_PROFILES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSidingProfile(p.id)}
                        className={`rounded-lg border px-3 py-2.5 text-left text-sm ${
                          sidingProfile === p.id
                            ? "border-primary-aqua bg-primary-aqua/10"
                            : "border-base-black/10 bg-base-white"
                        }`}
                      >
                        <span className="font-medium text-base-black">{p.label}</span>
                        <span className="block text-xs text-base-black/50">{p.hint}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-base-black/55">
                    Colour
                  </p>
                  {hardieMode ? (
                    <p className="mt-2 flex items-start gap-2 text-xs text-base-black/55">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-aqua" />
                      James Hardie Statement Collection palette (sample hex values for preview).
                    </p>
                  ) : null}
                  {gentekMode ? (
                    <p className="mt-2 flex items-start gap-2 text-xs text-base-black/55">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-aqua" />
                      Gentek-style designer colours — approximate matches for screen use.
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sidingPalette.map((c, idx) => (
                      <button
                        key={`${c.hex}-${c.name}-${idx}`}
                        type="button"
                        onClick={() => {
                          setSidingColor(c.hex);
                          setSidingColorName(c.name);
                        }}
                        className={`relative h-10 w-10 rounded-full border shadow-sm ${
                          sidingColor === c.hex ? "ring-2 ring-primary-aqua ring-offset-2" : ""
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                        aria-label={c.name}
                      >
                        {sidingColor === c.hex ? (
                          <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-xs text-base-black/50">Custom hex</span>
                    <input
                      type="color"
                      value={sidingColor}
                      onChange={(e) => {
                        setSidingColor(e.target.value);
                        setSidingColorName("Custom mix");
                      }}
                      className="h-10 w-14 cursor-pointer rounded border border-base-black/15 bg-base-white p-1"
                    />
                    <span className="text-xs text-base-black/60">
                      {sidingColorName} · {sidingColor}
                    </span>
                  </div>
                </div>

                <div>
                  <label htmlFor="roof-trim" className="text-xs font-semibold uppercase text-base-black/55">
                    Roof / rake trim (preview)
                  </label>
                  <input
                    id="roof-trim"
                    type="color"
                    value={roofTrimColor}
                    onChange={(e) => setRoofTrimColor(e.target.value)}
                    className="mt-2 h-10 w-14 cursor-pointer rounded border border-base-black/15 bg-base-white p-1"
                  />
                </div>
              </div>
            ) : null}

            {tab === "windows" ? (
              <div className="space-y-8">
                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-wide text-base-black/55">
                    Operational style
                  </legend>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {WINDOW_STYLES.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => setWindowStyle(w.id)}
                        className={`rounded-lg border px-3 py-2.5 text-left text-sm ${
                          windowStyle === w.id
                            ? "border-primary-aqua bg-primary-aqua/10"
                            : "border-base-black/10 bg-base-white"
                        }`}
                      >
                        <span className="font-medium text-base-black">{w.label}</span>
                        <span className="block text-xs text-base-black/50">{w.note}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-wide text-base-black/55">
                    Frame substrate
                  </legend>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {WINDOW_FRAMES.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setWindowFrame(f.id)}
                        className={`rounded-lg border px-3 py-2.5 text-left text-sm ${
                          windowFrame === f.id
                            ? "border-primary-aqua bg-primary-aqua/10"
                            : "border-base-black/10 bg-base-white"
                        }`}
                      >
                        {f.label}
                        {f.thermalBreak ? (
                          <span className="mt-1 block text-xs text-amber-800">Thermal break required</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  {thermalBreakNote ? (
                    <p className="mt-3 flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950 ring-1 ring-amber-200">
                      <Info className="h-4 w-4 shrink-0" />
                      Aluminum frames must include a thermal break to meet typical energy codes —
                      we&apos;ll confirm DP rating and spacer systems at quote stage.
                    </p>
                  ) : null}
                </fieldset>

                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-wide text-base-black/55">
                    Glazing package
                  </legend>
                  <div className="mt-3 grid gap-2">
                    {GLAZING_PACKAGES.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setGlazing(g.id)}
                        className={`rounded-lg border px-3 py-2.5 text-left text-sm ${
                          glazing === g.id
                            ? "border-primary-aqua bg-primary-aqua/10"
                            : "border-base-black/10 bg-base-white"
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-wide text-base-black/55">
                    Hardware
                  </legend>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {WINDOW_HARDWARE.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setWinHardware(h.id)}
                        className={`rounded-md border px-3 py-2 text-sm ${
                          winHardware === h.id
                            ? "border-primary-aqua bg-primary-aqua/10"
                            : "border-base-black/10 bg-base-white"
                        }`}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase text-base-black/55">
                      Exterior frame colour (preview)
                    </label>
                    <input
                      type="color"
                      value={windowFrameExteriorColor}
                      onChange={(e) => setWindowFrameExteriorColor(e.target.value)}
                      className="mt-2 h-10 w-full max-w-[120px] cursor-pointer rounded border border-base-black/15 bg-base-white p-1"
                    />
                    <p className="mt-1 text-[11px] text-base-black/45">
                      Dark frames are trending vs. white on light siding.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase text-base-black/55">
                      Glass tint (preview)
                    </label>
                    <input
                      type="color"
                      value={windowGlassColor}
                      onChange={(e) => setWindowGlassColor(e.target.value)}
                      className="mt-2 h-10 w-full max-w-[120px] cursor-pointer rounded border border-base-black/15 bg-base-white p-1"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "doors" ? (
              <div className="space-y-8">
                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-wide text-base-black/55">
                    Entry system
                  </legend>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {DOOR_SYSTEMS.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDoorSystem(d.id)}
                        className={`rounded-lg border px-3 py-2.5 text-left text-sm ${
                          doorSystem === d.id
                            ? "border-primary-aqua bg-primary-aqua/10"
                            : "border-base-black/10 bg-base-white"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-wide text-base-black/55">
                    Slab material
                  </legend>
                  <div className="mt-3 grid gap-2">
                    {DOOR_SUBSTRATES.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDoorSubstrate(d.id)}
                        className={`rounded-lg border px-3 py-2.5 text-left text-sm ${
                          doorSubstrate === d.id
                            ? "border-primary-aqua bg-primary-aqua/10"
                            : "border-base-black/10 bg-base-white"
                        }`}
                      >
                        <span className="font-medium text-base-black">{d.label}</span>
                        <span className="block text-xs text-base-black/50">
                          Finish options: {d.finishes.join(", ")}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-wide text-base-black/55">
                    Glass proportion
                  </legend>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {DOOR_GLASS_LITES.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setDoorLite(l.id)}
                        className={`rounded-md border px-3 py-2 text-sm ${
                          doorLite === l.id
                            ? "border-primary-aqua bg-primary-aqua/10"
                            : "border-base-black/10 bg-base-white"
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-base-black/55">
                    Finish system
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {doorFinishOptions(doorSubstrate).map((ft) => (
                      <button
                        key={ft}
                        type="button"
                        onClick={() => setDoorFinishType(ft)}
                        className={`rounded-md border px-3 py-2 text-sm capitalize ${
                          doorFinishType === ft
                            ? "border-primary-aqua bg-primary-aqua/10"
                            : "border-base-black/10 bg-base-white"
                        }`}
                      >
                        {ft}
                      </button>
                    ))}
                  </div>
                  {doorFinishType === "paint" ? (
                    <div className="mt-3">
                      <label className="text-xs text-base-black/55">Paint colour family</label>
                      <select
                        value={doorColorLabel}
                        onChange={(e) => setDoorColorLabel(e.target.value)}
                        className="mt-1 w-full max-w-md rounded-md border border-base-black/15 bg-base-white px-3 py-2 text-sm"
                      >
                        {PAINT_FINISHES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <label className="text-xs text-base-black/55">Woodgrain stain</label>
                      <select
                        value={doorStainLabel}
                        onChange={(e) => setDoorStainLabel(e.target.value)}
                        className="mt-1 w-full max-w-md rounded-md border border-base-black/15 bg-base-white px-3 py-2 text-sm"
                      >
                        {STAIN_FINISHES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="mt-4">
                    <label className="text-xs text-base-black/55">Door preview colour</label>
                    <input
                      type="color"
                      value={doorPanelColor}
                      onChange={(e) => setDoorPanelColor(e.target.value)}
                      className="mt-2 h-10 w-14 cursor-pointer rounded border border-base-black/15 bg-base-white p-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase text-base-black/55">
                    Entry hardware finish
                  </label>
                  <select
                    value={entryHardwareFinish}
                    onChange={(e) => setEntryHardwareFinish(e.target.value)}
                    className="mt-2 w-full max-w-md rounded-md border border-base-black/15 bg-base-white px-3 py-2 text-sm"
                  >
                    {HARDWARE_FINISHES.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex cursor-pointer items-center gap-3 text-sm text-base-black/80">
                  <input
                    type="checkbox"
                    checked={smartLock}
                    onChange={(e) => setSmartLock(e.target.checked)}
                    className="h-4 w-4 rounded border-base-black/20 text-primary-aqua"
                  />
                  Interested in smart lock / keyless upgrade
                </label>
              </div>
            ) : null}

            <div className="rounded-lg border border-base-black/10 bg-base-white p-4 sm:p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-base-black/70">
                Scope line builder
              </h3>
              <p className="mt-2 text-xs text-base-black/55">
                Add line items from the current tab to describe scope and quantities. Pricing is not
                shown on the website—our team applies internal rates when preparing your quote.{" "}
                <strong className="text-base-black">SQ = 100 sq ft</strong>.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="text-xs text-base-black/60">
                  Wall width (ft)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={wallWidthFt}
                    onChange={(e) => setWallWidthFt(e.target.value)}
                    className="mt-1 w-full rounded-md border border-base-black/15 bg-base-white px-2.5 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-base-black/60">
                  Wall height (ft)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={wallHeightFt}
                    onChange={(e) => setWallHeightFt(e.target.value)}
                    className="mt-1 w-full rounded-md border border-base-black/15 bg-base-white px-2.5 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-base-black/60">
                  Wall count
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={wallCount}
                    onChange={(e) => setWallCount(e.target.value)}
                    className="mt-1 w-full rounded-md border border-base-black/15 bg-base-white px-2.5 py-2 text-sm"
                  />
                </label>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-base-black/60">
                  Linear feet (for ft services)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={linearFeet}
                    onChange={(e) => setLinearFeet(e.target.value)}
                    className="mt-1 w-full rounded-md border border-base-black/15 bg-base-white px-2.5 py-2 text-sm"
                  />
                </label>
                <label className="text-xs text-base-black/60">
                  Openings count (doors/pairs/pcs)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={openingCount}
                    onChange={(e) => setOpeningCount(e.target.value)}
                    className="mt-1 w-full rounded-md border border-base-black/15 bg-base-white px-2.5 py-2 text-sm"
                  />
                </label>
              </div>

              <p className="mt-3 text-[11px] text-base-black/55">
                Derived area: <strong className="text-base-black">{scopedAreaSqFt.toFixed(1)} sq ft</strong>{" "}
                ({(scopedAreaSqFt / 100).toFixed(2)} sq)
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <select
                  value={selectedRateItem}
                  onChange={(e) => setSelectedRateItem(e.target.value)}
                  className="w-full rounded-md border border-base-black/15 bg-base-white px-3 py-2 text-sm"
                >
                  {tabRateOptions.length ? (
                    tabRateOptions.map((item) => (
                      <option key={item.item} value={item.item}>
                        {item.item} ({item.coverage.toUpperCase()})
                      </option>
                    ))
                  ) : (
                    <option value="">No matching line items for this tab</option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={addEstimateLine}
                  disabled={!tabRateOptions.length}
                  className="rounded-md bg-base-black px-4 py-2 text-sm font-semibold text-base-white disabled:opacity-50"
                >
                  Add line item
                </button>
                <button
                  type="button"
                  onClick={applyDimensionQuantities}
                  disabled={!estimateLines.length}
                  className="rounded-md border border-base-black/15 bg-base-white px-4 py-2 text-sm font-semibold text-base-black disabled:opacity-50"
                >
                  Apply dimensions
                </button>
              </div>

              {estimateLines.length ? (
                <div className="mt-4 space-y-2">
                  {estimateLines.map((line) => (
                    <div
                      key={line.item}
                      className="grid gap-2 rounded-md border border-base-black/10 bg-zinc-50 p-3 sm:grid-cols-[1fr_auto_auto]"
                    >
                      <div>
                        <p className="text-sm font-semibold text-base-black">{line.item}</p>
                        <p className="text-[11px] text-base-black/55">
                          Unit: {line.coverage.toUpperCase()} · Waste allowance {line.wasteFactor || "0%"}
                        </p>
                      </div>
                      <label className="text-xs text-base-black/60">
                        Qty
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.quantity}
                          onChange={(e) => {
                            const next = Math.max(0.01, safeNumber(e.target.value, 0.01));
                            setEstimateLines((prev) =>
                              prev.map((p) => (p.item === line.item ? { ...p, quantity: next } : p)),
                            );
                          }}
                          className="mt-1 w-24 rounded-md border border-base-black/15 bg-base-white px-2 py-1.5 text-sm"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setEstimateLines((prev) => prev.filter((p) => p.item !== line.item))}
                        className="self-end pb-1 text-xs font-semibold uppercase tracking-wide text-base-black/55 transition hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  <p className="rounded-md border border-dashed border-base-black/15 bg-base-white p-3 text-xs leading-relaxed text-base-black/60">
                    Dollar amounts are not shown here. When you send a quote request, we match these
                    lines to internal labour and material pricing and reply with a written estimate.
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-xs text-base-black/55">
                  No scope lines added yet. Choose a line item and click <strong>Add line item</strong>.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={applyToQuote}
              className="w-full rounded-md bg-primary-aqua px-5 py-3.5 text-sm font-semibold text-base-white shadow-sm transition-opacity hover:opacity-90 active:scale-[0.99] sm:w-auto"
            >
              Get a quote with these selections
            </button>
            <p className="text-xs text-base-black/50">
              Opens the contact form with a detailed summary. Edit before sending.
            </p>
          </div>

          <div className="lg:col-span-5 lg:sticky lg:top-28">
            <HousePreview
              sidingColor={sidingColor}
              sidingPattern={pattern}
              roofTrimColor={roofTrimColor}
              windowFrameColor={windowFrameExteriorColor}
              windowGlassColor={windowGlassColor}
              doorColor={doorPanelColor}
            />
          </div>
        </div>
          </>
        ) : (
          <div className="mt-8 rounded-lg border border-base-black/10 bg-base-white/80 px-4 py-6 sm:px-6">
            <p className="text-sm font-semibold text-base-black">Exterior designer is hidden</p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-base-black/70">
              Requesting a quote for decks, roofing, renovations, or anything other than siding /
              windows / doors? Use <strong className="text-base-black">Start Your Project</strong>{" "}
              below, select <strong className="text-base-black">Other services</strong>, and describe
              your project—no configuration package required.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
