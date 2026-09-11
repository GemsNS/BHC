"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import {
  ESRI_ATTRIBUTION,
  ESRI_WORLD_IMAGERY_URL,
  HRM_CENTER,
  OSM_ATTRIBUTION,
} from "@/lib/gods-eye";

export type GodsEyeMapProps = {
  /** "satellite" = Esri World Imagery (keyless); "streets" = OSM */
  basemap?: "satellite" | "streets";
  className?: string;
};

/**
 * Lightweight HRM ops map (Leaflet + keyless Esri/OSM).
 * Full Cesium God's Eye View is intentionally not vendored into Next —
 * see docs/GROKBOT_GODS_EYE_HANDBACK.md.
 */
export function GodsEyeMap({
  basemap = "satellite",
  className,
}: GodsEyeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    void import("leaflet")
      .then((leaflet) => {
        const L = leaflet.default;
        if (cancelled || !containerRef.current) return;

        const map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
        }).setView([HRM_CENTER.lat, HRM_CENTER.lng], HRM_CENTER.zoom);

        const tileUrl =
          basemap === "streets"
            ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            : ESRI_WORLD_IMAGERY_URL;
        const attribution =
          basemap === "streets" ? OSM_ATTRIBUTION : ESRI_ATTRIBUTION;

        L.tileLayer(tileUrl, {
          attribution,
          maxZoom: 19,
        }).addTo(map);

        L.circle([HRM_CENTER.lat, HRM_CENTER.lng], {
          radius: 18_000,
          color: "#38bdf8",
          weight: 1.5,
          fillColor: "#0ea5e9",
          fillOpacity: 0.08,
          dashArray: "6 8",
        })
          .bindTooltip(HRM_CENTER.label, { permanent: false, direction: "top" })
          .addTo(map);

        L.marker([HRM_CENTER.lat, HRM_CENTER.lng], {
          title: HRM_CENTER.shortLabel,
        })
          .bindPopup(
            `<strong>${HRM_CENTER.shortLabel}</strong><br/>${HRM_CENTER.label}<br/><span style="opacity:.75">${HRM_CENTER.lat.toFixed(4)}°N, ${Math.abs(HRM_CENTER.lng).toFixed(4)}°W</span>`,
          )
          .addTo(map);

        mapRef.current = map;
        setReady(true);
        window.setTimeout(() => map.invalidateSize(), 80);
        window.setTimeout(() => map.invalidateSize(), 400);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Map failed to load";
        setError(msg);
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [basemap]);

  return (
    <div className={className ?? "gods-eye-map-wrap"}>
      {error ? (
        <p className="gods-eye-map-error" role="alert">
          Map unavailable ({error}). CRM remains operational.
        </p>
      ) : null}
      {!ready && !error ? (
        <p className="gods-eye-map-loading" aria-live="polite">
          Loading {HRM_CENTER.shortLabel} map…
        </p>
      ) : null}
      <div
        ref={containerRef}
        className="gods-eye-map"
        role="application"
        aria-label={`${HRM_CENTER.shortLabel} operations map`}
      />
    </div>
  );
}
