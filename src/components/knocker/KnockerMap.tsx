"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, LayerGroup, LeafletMouseEvent } from "leaflet";
import type { KnockColorCode, KnockEvent, KnockRepLocation, KnockTerritory } from "@/lib/types";
import { clusterPins } from "@/lib/knocker/cluster";
import { colorForOutcome } from "@/lib/knocker/colors";
import type { LatLng } from "@/lib/knocker/geo";
import { closePolygon, simplifyPath } from "@/lib/knocker/geo";

export type KnockerMapProps = {
  center: LatLng;
  pins: KnockEvent[];
  territories: KnockTerritory[];
  repLocations: KnockRepLocation[];
  colorCodes: KnockColorCode[];
  drawMode?: boolean;
  draftPoints?: LatLng[];
  onDraftPoint?: (pt: LatLng) => void;
  onPinSelect?: (pin: KnockEvent) => void;
  onMapClick?: (pt: LatLng) => void;
  selectedPinId?: string | null;
  routeOrder?: string[];
};

export function KnockerMap({
  center,
  pins,
  territories,
  repLocations,
  colorCodes,
  drawMode,
  draftPoints = [],
  onDraftPoint,
  onPinSelect,
  onMapClick,
  selectedPinId,
  routeOrder = [],
}: KnockerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    void import("leaflet").then((leaflet) => {
      const L = leaflet.default;
      if (cancelled || !containerRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: true }).setView(
        [center.lat, center.lng],
        15,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      map.on("click", (e: LeafletMouseEvent) => {
        const pt = { lat: e.latlng.lat, lng: e.latlng.lng };
        if (drawMode && onDraftPoint) onDraftPoint(pt);
        else if (onMapClick) onMapClick(pt);
      });
      // Fix blank map when container was hidden / resized (common on Pages + tab switches)
      window.setTimeout(() => map.invalidateSize(), 80);
      window.setTimeout(() => map.invalidateSize(), 400);
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView([center.lat, center.lng], mapRef.current.getZoom());
  }, [center.lat, center.lng]);

  useEffect(() => {
    void import("leaflet").then((leaflet) => {
      const L = leaflet.default;
      const map = mapRef.current;
      const group = layerRef.current;
      if (!map || !group) return;
      group.clearLayers();

      for (const t of territories) {
        if (t.polygon.length < 3) continue;
        const latlngs = t.polygon.map(([lat, lng]) => [lat, lng] as [number, number]);
        L.polygon(latlngs, {
          color: t.colorHex,
          fillColor: t.colorHex,
          fillOpacity: t.fillOpacity,
          weight: 2,
        }).addTo(group);
      }

      if (draftPoints.length >= 2) {
        const simplified = simplifyPath(draftPoints);
        const closed = closePolygon(simplified).map((p) => [p.lat, p.lng] as [number, number]);
        L.polyline(closed, { color: "#00e5ff", weight: 2, dashArray: "4 6" }).addTo(group);
        for (const p of draftPoints) {
          L.circleMarker([p.lat, p.lng], { radius: 4, color: "#00e5ff", fillOpacity: 1 }).addTo(group);
        }
      }

      const mappable = pins.filter((p) => p.lat != null && p.lng != null);
      const clusterInput = mappable.map((p) => ({
        id: p.id,
        lat: p.lat!,
        lng: p.lng!,
        color: colorForOutcome(p.outcome, colorCodes).hex,
      }));
      const { clusters, singles } = clusterPins(clusterInput, map.getZoom());

      for (const c of clusters) {
        L.circleMarker([c.lat, c.lng], {
          radius: 14,
          color: c.color,
          fillColor: c.color,
          fillOpacity: 0.85,
          weight: 2,
        })
          .bindTooltip(String(c.count), { permanent: true, direction: "center", className: "knocker-cluster-tip" })
          .addTo(group);
      }

      for (const pin of mappable) {
        if (!singles.some((s) => s.id === pin.id) && map.getZoom() < 16) continue;
        const color = colorForOutcome(pin.outcome, colorCodes);
        const routeIdx = routeOrder.indexOf(pin.id);
        const marker = L.circleMarker([pin.lat!, pin.lng!], {
          radius: selectedPinId === pin.id ? 11 : 8,
          color: color.stroke,
          fillColor: color.hex,
          fillOpacity: 0.95,
          weight: selectedPinId === pin.id ? 3 : 2,
        });
        marker.bindPopup(
          `<strong>${pin.address}</strong><br/>${pin.outcome.replace(/_/g, " ")}${routeIdx >= 0 ? `<br/>Stop #${routeIdx + 1}` : ""}`,
        );
        marker.on("click", () => onPinSelect?.(pin));
        marker.addTo(group);
      }

      for (const loc of repLocations.slice(0, 20)) {
        L.circleMarker([loc.lat, loc.lng], {
          radius: 6,
          color: "#39ff14",
          fillColor: "#39ff14",
          fillOpacity: 0.7,
          weight: 1,
        })
          .bindTooltip("Rep GPS", { direction: "top" })
          .addTo(group);
      }
    });
  }, [
    pins,
    territories,
    repLocations,
    colorCodes,
    draftPoints,
    drawMode,
    onPinSelect,
    selectedPinId,
    routeOrder,
  ]);

  return <div ref={containerRef} className="knocker-map-canvas" aria-label="Knocker territory map" />;
}
