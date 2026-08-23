"use client";

import Link from "next/link";
import type { AppData } from "@/lib/types";
import type { DeckView } from "@/lib/command-deck";
import {
  buildAdminKpis,
  buildInstallGrid,
  buildNetworkGraph,
  buildSalesTree,
  deckViewHref,
} from "@/lib/command-deck";
import { DeckGraph } from "./DeckGraph";
import { formatCurrency } from "@/lib/utils";

export function CommandCanvas({
  view,
  data,
}: {
  view: DeckView;
  data: AppData;
}) {
  if (view === "sales") {
    const graph = buildSalesTree(data);
    return (
      <div className="hud-canvas-inner">
        <DeckGraph nodes={graph.nodes} edges={graph.edges} />
        <Link href={deckViewHref("sales")} className="hud-canvas-cta">
          Open pipeline →
        </Link>
      </div>
    );
  }

  if (view === "install") {
    const jobs = buildInstallGrid(data);
    return (
      <div className="hud-canvas-inner hud-install-grid">
        {jobs.map((job) => (
          <Link
            key={job.id}
            href={`/admin/jobs`}
            className="hud-hud-card"
          >
            <span className="hud-hud-card-tag">{job.status.replace("_", " ")}</span>
            <p className="hud-hud-card-title">{job.title}</p>
            <p className="hud-hud-card-meta">{job.address}</p>
            <p className="hud-hud-card-val">{formatCurrency(job.contractValue)}</p>
          </Link>
        ))}
        {!jobs.length ? (
          <p className="hud-empty">No active installs scheduled.</p>
        ) : null}
        <Link href={deckViewHref("install")} className="hud-canvas-cta">
          All jobs →
        </Link>
      </div>
    );
  }

  if (view === "admin") {
    const kpis = buildAdminKpis(data);
    return (
      <div className="hud-canvas-inner hud-admin-grid">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="hud-kpi">
            <p className="hud-kpi-val">{kpi.value}</p>
            <p className="hud-kpi-label">{kpi.label}</p>
          </div>
        ))}
        <Link href={deckViewHref("admin")} className="hud-canvas-cta">
          Full analytics →
        </Link>
      </div>
    );
  }

  const graph = buildNetworkGraph(data);
  return (
    <div className="hud-canvas-inner">
      <DeckGraph nodes={graph.nodes} edges={graph.edges} chaotic />
      <Link href={deckViewHref("network")} className="hud-canvas-cta">
        Sales hub →
      </Link>
    </div>
  );
}
