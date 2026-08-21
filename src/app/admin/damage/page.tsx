"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { ImagePicker } from "@/components/ImagePicker";
import { StatusBadge } from "@/components/StatusBadge";
import {
  clientNewId,
  clientNowIso,
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type {
  DamageReport,
  DamageSeverity,
  DamageTarget,
  Job,
  ToolAsset,
  Vehicle,
} from "@/lib/types";
import { useSession } from "@/lib/session";

export default function DamageAdminPage() {
  const { user } = useSession();
  const [reports, setReports] = useState<DamageReport[]>([]);
  const [tools, setTools] = useState<ToolAsset[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [images, setImages] = useState<string[]>([]);

  async function refresh() {
    if (isStaticDemo()) {
      const d = await loadAppData();
      setReports(d.damageReports);
      setTools(d.tools);
      setVehicles(d.vehicles);
      setJobs(d.jobs);
      return;
    }
    try {
      const json = await fetchJson<{
        reports: DamageReport[];
        tools: ToolAsset[];
        vehicles: Vehicle[];
        jobs: Job[];
      }>("/api/damage");
      setReports(json.reports);
      setTools(json.tools);
      setVehicles(json.vehicles);
      setJobs(json.jobs);
    } catch {
      const d = await loadAppData();
      setReports(d.damageReports);
      setTools(d.tools);
      setVehicles(d.vehicles);
      setJobs(d.jobs);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const targetType = String(form.get("targetType") || "other") as DamageTarget;
    const targetId = String(form.get("targetId") || "") || null;
    let targetLabel = String(form.get("targetLabel") || "");
    if (!targetLabel && targetId) {
      targetLabel =
        tools.find((t) => t.id === targetId)?.name ||
        vehicles.find((v) => v.id === targetId)?.name ||
        targetId;
    }
    const payload = {
      targetType,
      targetId,
      targetLabel: targetLabel || "Unspecified",
      jobId: String(form.get("jobId") || "") || null,
      reportedById: user.id,
      severity: String(form.get("severity") || "medium") as DamageSeverity,
      description: String(form.get("description") || ""),
      imageDataUrls: images,
    };
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        d.damageReports.unshift({
          id: clientNewId(),
          ...payload,
          createdAt: clientNowIso(),
          resolved: false,
        });
        if (payload.targetType === "tool" && payload.targetId && payload.severity === "critical") {
          const tool = d.tools.find((t) => t.id === payload.targetId);
          if (tool) tool.status = "damaged";
        }
      });
    } else {
      await fetchJson("/api/damage", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    formEl.reset();
    setImages([]);
    await refresh();
  }

  async function resolve(id: string) {
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        const r = d.damageReports.find((x) => x.id === id);
        if (r) r.resolved = true;
      });
    } else {
      await fetchJson("/api/damage", {
        method: "PATCH",
        body: JSON.stringify({ id, resolved: true }),
      });
    }
    await refresh();
  }

  return (
    <RequireAuth perm="damage">
      <div>
        <PageHeader
          title="Damage reports"
          subtitle="Track tool, vehicle, material, and job-site damage with photos."
        />
        <form onSubmit={onCreate} className="form-grid">
          <h2>New report</h2>
          <select name="targetType" className="field-input" defaultValue="tool">
            <option value="tool">Tool</option>
            <option value="vehicle">Vehicle</option>
            <option value="material">Material</option>
            <option value="job_site">Job site</option>
            <option value="other">Other</option>
          </select>
          <select name="targetId" className="field-input" defaultValue="">
            <option value="">Select tool/vehicle (optional)</option>
            {tools.map((t) => (
              <option key={t.id} value={t.id}>
                Tool: {t.name}
              </option>
            ))}
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                Vehicle: {v.name}
              </option>
            ))}
          </select>
          <input name="targetLabel" placeholder="Label if not selected" className="field-input" />
          <select name="jobId" className="field-input" defaultValue="">
            <option value="">Related job (optional)</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
          <select name="severity" className="field-input" defaultValue="medium">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <textarea name="description" required rows={3} placeholder="What happened?" className="field-input" />
          <div className="sm:col-span-2 lg:col-span-3">
            <ImagePicker previews={images} onChange={setImages} />
          </div>
          <button type="submit" className="btn-primary">
            Submit report
          </button>
        </form>

        <ul className="board-list">
          {reports.map((r) => (
            <li key={r.id} className="board-card">
              <div className="board-card-head">
                <h3>{r.targetLabel}</h3>
                <StatusBadge status={r.severity} />
              </div>
              <p className="board-body">{r.description}</p>
              <div className="board-meta">
                <span>{r.targetType}</span>
                <span>{new Date(r.createdAt).toLocaleString()}</span>
                <span>{r.resolved ? "Resolved" : "Open"}</span>
              </div>
              {r.imageDataUrls.length ? (
                <div className="cc-image-grid mt-2">
                  {r.imageDataUrls.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={src} alt="" className="cc-image-thumb-static" />
                  ))}
                </div>
              ) : null}
              {!r.resolved ? (
                <button type="button" className="board-delete" onClick={() => resolve(r.id)}>
                  Mark resolved
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </RequireAuth>
  );
}
