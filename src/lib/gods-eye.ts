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

function env(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const v = process.env?.[name]?.trim();
  return v || undefined;
}

function truthyFlag(raw: string | undefined): boolean {
  const v = (raw ?? "0").toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Explicit kill-switch. Default OFF.
 * Server prefers GODS_EYE_ENABLED; client builds also see NEXT_PUBLIC_GODS_EYE_ENABLED.
 */
export function godsEyeEnabled(): boolean {
  // Prefer public flag on the client so nav can hide without a round-trip.
  if (typeof window !== "undefined") {
    return truthyFlag(env("NEXT_PUBLIC_GODS_EYE_ENABLED"));
  }
  const server = env("GODS_EYE_ENABLED");
  if (server !== undefined) return truthyFlag(server);
  return truthyFlag(env("NEXT_PUBLIC_GODS_EYE_ENABLED"));
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
  return (
    env("NEXT_PUBLIC_GODS_EYE_EMBED_URL") ??
    env("GODS_EYE_EMBED_URL") ??
    null
  );
}

export function godsEyeConfigStatus(): GodsEyeConfigStatus {
  return {
    enabled: godsEyeEnabled(),
    embedUrl: godsEyeEmbedUrl(),
    cesiumIonConfigured: Boolean(env("NEXT_PUBLIC_CESIUM_ION_TOKEN") ?? env("CESIUM_ION_TOKEN")),
    googleMapsConfigured: Boolean(
      env("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY") ?? env("GOOGLE_MAPS_API_KEY"),
    ),
    region: HRM_CENTER,
  };
}

/** Esri World Imagery — keyless satellite basemap (attribution required). */
export const ESRI_WORLD_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const ESRI_ATTRIBUTION =
  "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
