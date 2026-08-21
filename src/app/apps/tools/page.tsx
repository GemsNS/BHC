"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppsShell } from "@/components/AppsShell";
import { RequireAuth } from "@/components/RequireAuth";
import { StatusBadge } from "@/components/StatusBadge";
import {
  clientNewId,
  clientNowIso,
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { Job, ToolAsset } from "@/lib/types";
import { useSession } from "@/lib/session";

export default function AppsToolsPage() {
  const { user } = useSession();
  const [tools, setTools] = useState<ToolAsset[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  async function refresh() {
    const d = await loadAppData();
    setTools(d.tools);
    setJobs(d.jobs);
    if (!isStaticDemo()) {
      try {
        const json = await fetchJson<{ tools: ToolAsset[]; jobs: Job[] }>(
          "/api/tools",
        );
        setTools(json.tools);
        setJobs(json.jobs);
      } catch {
        /* keep local */
      }
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function checkout(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const form = new FormData(e.currentTarget);
    const toolId = String(form.get("toolId") || "");
    const jobId = String(form.get("jobId") || "") || null;
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        const tool = d.tools.find((t) => t.id === toolId);
        if (!tool || tool.status !== "available") return;
        const stamp = clientNowIso();
        tool.status = "checked_out";
        tool.checkedOutToId = user.id;
        tool.checkedOutAt = stamp;
        tool.jobId = jobId;
        d.toolCheckouts.unshift({
          id: clientNewId(),
          toolId,
          employeeId: user.id,
          jobId,
          checkedOutAt: stamp,
          checkedInAt: null,
          notes: "",
        });
      });
    } else {
      await fetchJson("/api/tools", {
        method: "POST",
        body: JSON.stringify({
          action: "checkout",
          toolId,
          employeeId: user.id,
          jobId,
        }),
      });
    }
    await refresh();
  }

  async function checkin(toolId: string) {
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        const tool = d.tools.find((t) => t.id === toolId);
        if (!tool) return;
        tool.status = "available";
        tool.checkedOutToId = null;
        tool.checkedOutAt = null;
        tool.jobId = null;
        const open = d.toolCheckouts.find(
          (c) => c.toolId === toolId && !c.checkedInAt,
        );
        if (open) open.checkedInAt = clientNowIso();
      });
    } else {
      await fetchJson("/api/tools", {
        method: "POST",
        body: JSON.stringify({ action: "checkin", toolId }),
      });
    }
    await refresh();
  }

  const mine = tools.filter((t) => t.checkedOutToId === user?.id);
  const available = tools.filter((t) => t.status === "available");

  return (
    <AppsShell title="Tools">
      <RequireAuth perm="tools">
        <h1 className="apps-page-heading">Tool in / out</h1>
        <form onSubmit={checkout} className="knocker-form">
          <h2>Check out</h2>
          <select name="toolId" required className="field-input" defaultValue="">
            <option value="" disabled>
              Available tool
            </option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.assetTag})
              </option>
            ))}
          </select>
          <select name="jobId" className="field-input" defaultValue="">
            <option value="">No job</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary btn-block">
            Check out
          </button>
        </form>

        <section className="knocker-recent mt-4">
          <h3>Checked out to you</h3>
          <ul>
            {mine.map((t) => (
              <li key={t.id}>
                <div>
                  <span className="font-medium">{t.name}</span>
                  <StatusBadge status={t.status} />
                </div>
                <button
                  type="button"
                  className="btn-secondary mt-2"
                  onClick={() => checkin(t.id)}
                >
                  Check in
                </button>
              </li>
            ))}
            {!mine.length ? <li className="empty">Nothing checked out.</li> : null}
          </ul>
        </section>
      </RequireAuth>
    </AppsShell>
  );
}
