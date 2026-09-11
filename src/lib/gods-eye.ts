/**
 * God's Eye View — HRM ops map kill-switch and config.
 *
 * Env (Twilio-style, default OFF):
 *   GODS_EYE_ENABLED=0|1
 *   NEXT_PUBLIC_GODS_EYE_ENABLED=0|1   # client nav; keep in sync with GODS_EYE_ENABLED
 *
 * Optional (never required — soft-fail / degraded basemap):
 *   NEXT_PUBLIC_CESIUM_ION_TOKEN     # future Cesium photoreal path
 *   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY  # future Google 3D tiles
 *   GODS_EYE_EMBED_URL               # optional iframe to a hosted full GEV build
 *   NEXT_PUBLIC_GODS_EYE_EMBED_URL   # client-visible embed URL (same value)
 *
 * Note: NEXT_PUBLIC_* must be read as static `process.env.NEXT_PUBLIC_…`
 * identifiers so Next can inline them into the client bundle.
 */

/** Halifax Regional Municipality civic core (City Hall / downtown). */
export const HRM_CENTER = {
  lat: 44.6488,
  lng: -63.5752,
  /** Leaflet zoom ≈ regional metro overview */
  zoom: 11,
  label: "Halifax Regional Municipality (HRM)",
  shortLabel: "HRM",
} as const;

export type GodsEyeConfigStatus = {
  enabled: boolean;
  /** Optional remote full GEV (or other) embed URL when set. */
  embedUrl: string | null;
  /** Present but unused until Cesium path is wired — soft-fail only. */
  cesiumIonConfigured: boolean;
  googleMapsConfigured: boolean;
  region: typeof HRM_CENTER;
};

function truthyFlag(raw: string | undefined | null): boolean {
  const v = (raw ?? "0").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function serverEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const v = process.env?.[name]?.trim();
  return v || undefined;
}

/**
 * Explicit kill-switch. Default OFF.
 * Client uses statically referenced NEXT_PUBLIC_GODS_EYE_ENABLED (Next inlines it).
 * Server prefers GODS_EYE_ENABLED, then the public flag.
 */
export function godsEyeEnabled(): boolean {
  if (typeof window !== "undefined") {
    return truthyFlag(process.env.NEXT_PUBLIC_GODS_EYE_ENABLED);
  }
  const server = serverEnv("GODS_EYE_ENABLED");
  if (server !== undefined) return truthyFlag(server);
  return truthyFlag(process.env.NEXT_PUBLIC_GODS_EYE_ENABLED);
}

/** Whether an admin nav href should be shown (feature-flagged items). */
export function isGodsEyeNavHref(href: string): boolean {
  return href === "/admin/gods-eye" || href.startsWith("/admin/gods-eye/");
}

/** Hide God's Eye nav when the kill-switch is off. */
export function navItemVisibleForFlags(href: string): boolean {
  if (isGodsEyeNavHref(href)) return godsEyeEnabled();
  return true;
}

export function godsEyeEmbedUrl(): string | null {
  const pub = process.env.NEXT_PUBLIC_GODS_EYE_EMBED_URL?.trim();
  if (pub) return pub;
  return serverEnv("GODS_EYE_EMBED_URL") ?? null;
}

export function godsEyeConfigStatus(): GodsEyeConfigStatus {
  const cesium =
    process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN?.trim() ||
    serverEnv("CESIUM_ION_TOKEN");
  const google =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    serverEnv("GOOGLE_MAPS_API_KEY");
  return {
    enabled: godsEyeEnabled(),
    embedUrl: godsEyeEmbedUrl(),
    cesiumIonConfigured: Boolean(cesium),
    googleMapsConfigured: Boolean(google),
    region: HRM_CENTER,
  };
}

/** Esri World Imagery — keyless satellite basemap (attribution required). */
export const ESRI_WORLD_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const ESRI_ATTRIBUTION =
  "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
