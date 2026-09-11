"use client";

import { useMemo, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { PageFrame, Panel } from "@/components/cc";
import { GodsEyeMap } from "@/components/gods-eye/GodsEyeMap";
import {
  godsEyeConfigStatus,
  godsEyeEnabled,
  HRM_CENTER,
} from "@/lib/gods-eye";

/**
 * God's Eye View — HRM-focused ops map.
 *
 * Integrated: Leaflet + keyless Esri/OSM centered on Halifax Regional Municipality.
 * Deferred: full Cesium GEV (aircraft/AIS/voice) — optional iframe via GODS_EYE_EMBED_URL.
 * Kill-switch: GODS_EYE_ENABLED / NEXT_PUBLIC_GODS_EYE_ENABLED (default OFF).
 */
export default function GodsEyePage() {
  const [basemap, setBasemap] = useState<"satellite" | "streets">("satellite");
  const enabled = godsEyeEnabled();
  const status = useMemo(() => godsEyeConfigStatus(), []);

  if (!enabled) {
    return (
      <RequireAuth perm="dashboard">
        <PageFrame
          context="Intelligence layer"
          title="God's Eye View"
          subtitle="Feature is off. CRM and all other tabs stay fully operational."
        >
          <Panel title="Disabled (kill-switch)">
            <p className="gods-eye-disabled-copy">
              Set <code>GODS_EYE_ENABLED=1</code> and{" "}
              <code>NEXT_PUBLIC_GODS_EYE_ENABLED=1</code>, then restart the app
              to enable the HRM ops map. See{" "}
              <code>docs/GROKBOT_GODS_EYE_HANDBACK.md</code>.
            </p>
            <ul className="gods-eye-disabled-list">
              <li>Default camera / center: {HRM_CENTER.label}</li>
              <li>
                Coords: {HRM_CENTER.lat}°N, {Math.abs(HRM_CENTER.lng)}°W
              </li>
              <li>No map tiles or embeds load while disabled</li>
            </ul>
          </Panel>
        </PageFrame>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth perm="dashboard">
      <PageFrame
        context="Intelligence layer · HRM"
        title="God's Eye View"
        subtitle={`${HRM_CENTER.label} — keyless satellite/streets ops view. Full Cesium GEV optional via embed.`}
        actions={
          <div className="gods-eye-basemap-toggle" role="group" aria-label="Basemap">
            <button
              type="button"
              className={basemap === "satellite" ? "cc-btn cc-btn-primary" : "cc-btn"}
              onClick={() => setBasemap("satellite")}
            >
              Satellite
            </button>
            <button
              type="button"
              className={basemap === "streets" ? "cc-btn cc-btn-primary" : "cc-btn"}
              onClick={() => setBasemap("streets")}
            >
              Streets
            </button>
          </div>
        }
        className="gods-eye-page"
      >
        <div className="gods-eye-layout">
          <Panel title={`${HRM_CENTER.shortLabel} ops map`} className="gods-eye-map-panel">
            <GodsEyeMap key={basemap} basemap={basemap} />
          </Panel>

          <aside className="gods-eye-side">
            <Panel title="Region">
              <dl className="gods-eye-meta">
                <div>
                  <dt>Focus</dt>
                  <dd>{HRM_CENTER.label}</dd>
                </div>
                <div>
                  <dt>Center</dt>
                  <dd>
                    {HRM_CENTER.lat.toFixed(4)}°N, {Math.abs(HRM_CENTER.lng).toFixed(4)}°W
                  </dd>
                </div>
                <div>
                  <dt>Basemap</dt>
                  <dd>{basemap === "satellite" ? "Esri World Imagery (keyless)" : "OpenStreetMap"}</dd>
                </div>
              </dl>
            </Panel>

            <Panel title="Keys (optional)">
              <p className="gods-eye-side-copy">
                Photoreal Cesium / Google 3D tiles are <strong>not required</strong>.
                Status soft-fails when tokens are missing.
              </p>
              <ul className="gods-eye-key-status">
                <li>
                  Cesium ion:{" "}
                  {status.cesiumIonConfigured ? "configured" : "not set (ok)"}
                </li>
                <li>
                  Google Maps:{" "}
                  {status.googleMapsConfigured ? "configured" : "not set (ok)"}
                </li>
              </ul>
            </Panel>

            {status.embedUrl ? (
              <Panel title="Full GEV embed">
                <iframe
                  title="God's Eye View embed"
                  src={status.embedUrl}
                  className="gods-eye-embed"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  referrerPolicy="no-referrer"
                />
              </Panel>
            ) : (
              <Panel title="Full GEV">
                <p className="gods-eye-side-copy">
                  Upstream{" "}
                  <a
                    href="https://github.com/bilawalsidhu/gods-eye-view"
                    target="_blank"
                    rel="noreferrer"
                  >
                    bilawalsidhu/gods-eye-view
                  </a>{" "}
                  is not vendored here (Cesium + Node 24+). Point{" "}
                  <code>GODS_EYE_EMBED_URL</code> /{" "}
                  <code>NEXT_PUBLIC_GODS_EYE_EMBED_URL</code> at a hosted build
                  to iframe it. Respect third-party data licenses.
                </p>
              </Panel>
            )}
          </aside>
        </div>
      </PageFrame>
    </RequireAuth>
  );
}
