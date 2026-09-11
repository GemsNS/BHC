"use client";

import { useMemo } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { PageFrame, Panel } from "@/components/cc";
import { GodsEyeMap } from "@/components/gods-eye/GodsEyeMap";
import {
  godsEyeConfigStatus,
  godsEyeEnabled,
  HRM_CENTER,
} from "@/lib/gods-eye";

/**
 * God's Eye View — HRM ops console.
 *
 * Preferred mode: full-bleed iframe of a separately hosted God's Eye View
 * instance (GODS_EYE_EMBED_URL). Fallback: keyless Leaflet/Esri HRM map so the
 * tab is never a dead end while Grokbot stands up the full GEV stack.
 *
 * Kill-switch: GODS_EYE_ENABLED / NEXT_PUBLIC_GODS_EYE_ENABLED (default OFF).
 */
export default function GodsEyePage() {
  const enabled = godsEyeEnabled();
  const status = useMemo(() => godsEyeConfigStatus(), []);
  const embedUrl = status.embedUrl;

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
              <code>NEXT_PUBLIC_GODS_EYE_ENABLED=1</code>, rebuild, then point{" "}
              <code>GODS_EYE_EMBED_URL</code> at the hosted GEV instance. See{" "}
              <code>docs/GROKBOT_HANDBACK.md</code>.
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

  // Full GEV instance — primary UX once Grokbot deploys it
  if (embedUrl) {
    return (
      <RequireAuth perm="dashboard">
        <PageFrame
          context="Intelligence layer · HRM"
          title="God's Eye View"
          subtitle={`${HRM_CENTER.label} — live GEV instance`}
          className="gods-eye-page gods-eye-page-embed"
        >
          <div className="gods-eye-embed-shell">
            <iframe
              title="God's Eye View — HRM"
              src={embedUrl}
              className="gods-eye-embed-frame"
              allow="geolocation; fullscreen; clipboard-read; clipboard-write"
              referrerPolicy="no-referrer"
              // Scripts + same-origin needed for Cesium; forms locked down.
              sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"
            />
            <p className="gods-eye-embed-footnote">
              Hosted GEV · HRM default · webhook sink{" "}
              <code>/api/gods-eye/webhook</code> · kill-switch{" "}
              <code>GODS_EYE_ENABLED=0</code>
            </p>
          </div>
        </PageFrame>
      </RequireAuth>
    );
  }

  // Fallback until GEV is live — still useful, not a blank tab
  return (
    <RequireAuth perm="dashboard">
      <PageFrame
        context="Intelligence layer · HRM"
        title="God's Eye View"
        subtitle={`${HRM_CENTER.label} — fallback ops map (set GODS_EYE_EMBED_URL for full GEV)`}
        className="gods-eye-page"
      >
        <div className="gods-eye-layout">
          <Panel title={`${HRM_CENTER.shortLabel} fallback map`} className="gods-eye-map-panel">
            <GodsEyeMap basemap="satellite" />
          </Panel>
          <aside className="gods-eye-side">
            <Panel title="Waiting on full GEV">
              <p className="gods-eye-side-copy">
                Deploy{" "}
                <a
                  href="https://github.com/bilawalsidhu/gods-eye-view"
                  target="_blank"
                  rel="noreferrer"
                >
                  bilawalsidhu/gods-eye-view
                </a>{" "}
                as a sibling service, then set:
              </p>
              <pre className="gods-eye-env-snip">{`GODS_EYE_EMBED_URL=https://gev.bhcontracting.ca/
NEXT_PUBLIC_GODS_EYE_EMBED_URL=https://gev.bhcontracting.ca/`}</pre>
              <p className="gods-eye-side-copy">
                Full steps: <code>docs/GROKBOT_HANDBACK.md</code>
              </p>
            </Panel>
            <Panel title="Keys (optional)">
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
          </aside>
        </div>
      </PageFrame>
    </RequireAuth>
  );
}
