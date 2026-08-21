"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppsShell } from "@/components/AppsShell";
import { RequireAuth } from "@/components/RequireAuth";
import { ImagePicker } from "@/components/ImagePicker";
import {
  clientNewId,
  clientNowIso,
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { DamageSeverity, DamageTarget, Job, ToolAsset } from "@/lib/types";
import { useSession } from "@/lib/session";

export default function AppsDamagePage() {
  const { user } = useSession();
  const [tools, setTools] = useState<ToolAsset[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadAppData().then((d) => {
      setTools(d.tools);
      setJobs(d.jobs);
    });
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const targetId = String(form.get("targetId") || "") || null;
    const tool = tools.find((t) => t.id === targetId);
    const payload = {
      targetType: "tool" as DamageTarget,
      targetId,
      targetLabel: tool?.name || String(form.get("targetLabel") || "Damage"),
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
      });
    } else {
      await fetchJson("/api/damage", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    formEl.reset();
    setImages([]);
    setMessage("Damage report submitted.");
  }

  return (
    <AppsShell title="Damage">
      <RequireAuth perm="damage">
        <h1 className="apps-page-heading">Damage report</h1>
        <form onSubmit={onCreate} className="knocker-form">
          <h2>Report issue</h2>
          <select name="targetId" className="field-input" defaultValue="">
            <option value="">Tool (optional)</option>
            {tools.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            name="targetLabel"
            placeholder="What was damaged?"
            className="field-input"
          />
          <select name="jobId" className="field-input" defaultValue="">
            <option value="">Related job</option>
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
          <textarea
            name="description"
            required
            rows={3}
            placeholder="Describe the damage"
            className="field-input"
          />
          <ImagePicker previews={images} onChange={setImages} />
          <button type="submit" className="btn-primary btn-block">
            Submit
          </button>
          {message ? <p className="knocker-msg">{message}</p> : null}
        </form>
      </RequireAuth>
    </AppsShell>
  );
}
