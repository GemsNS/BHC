"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import {
  clientNewId,
  clientNowIso,
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { Employee, Job, ToolAsset, ToolCheckout } from "@/lib/types";
import { useSession } from "@/lib/session";
import { StatusBadge } from "@/components/StatusBadge";

export default function ToolsAdminPage() {
  const { user } = useSession();
  const [tools, setTools] = useState<ToolAsset[]>([]);
  const [checkouts, setCheckouts] = useState<ToolCheckout[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  async function refresh() {
    if (isStaticDemo()) {
      const d = await loadAppData();
      setTools(d.tools);
      setCheckouts(d.toolCheckouts);
      setEmployees(d.employees);
      setJobs(d.jobs);
      return;
    }
    try {
      const json = await fetchJson<{
        tools: ToolAsset[];
        checkouts: ToolCheckout[];
        employees: Employee[];
        jobs: Job[];
      }>("/api/tools");
      setTools(json.tools);
      setCheckouts(json.checkouts);
      setEmployees(json.employees);
      setJobs(json.jobs);
    } catch {
      const d = await loadAppData();
      setTools(d.tools);
      setCheckouts(d.toolCheckouts);
      setEmployees(d.employees);
      setJobs(d.jobs);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      name: String(form.get("name") || ""),
      category: String(form.get("category") || "General"),
      assetTag: String(form.get("assetTag") || ""),
      notes: String(form.get("notes") || ""),
    };
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        d.tools.push({
          id: clientNewId(),
          ...payload,
          status: "available",
          checkedOutToId: null,
          checkedOutAt: null,
          jobId: null,
        });
      });
    } else {
      await fetchJson("/api/tools", {
        method: "POST",
        body: JSON.stringify({ action: "create", ...payload }),
      });
    }
    formEl.reset();
    await refresh();
  }

  async function checkout(toolId: string) {
    if (!user) return;
    const jobId = (
      document.getElementById(`job-${toolId}`) as HTMLSelectElement | null
    )?.value;
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        const tool = d.tools.find((t) => t.id === toolId);
        if (!tool || tool.status !== "available") return;
        const stamp = clientNowIso();
        tool.status = "checked_out";
        tool.checkedOutToId = user.id;
        tool.checkedOutAt = stamp;
        tool.jobId = jobId || null;
        d.toolCheckouts.unshift({
          id: clientNewId(),
          toolId,
          employeeId: user.id,
          jobId: jobId || null,
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
          jobId: jobId || null,
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

  const nameOf = (id: string | null) =>
    employees.find((e) => e.id === id)?.name || "—";

  return (
    <RequireAuth perm="tools">
      <div>
        <PageHeader
          title="Tools — in / out"
          subtitle="Checkout yard tools to crew and jobs. Track who has what."
        />
        <form onSubmit={onCreate} className="form-grid">
          <h2>Add tool</h2>
          <input name="name" required placeholder="Name" className="field-input" />
          <input name="assetTag" required placeholder="Asset tag" className="field-input" />
          <input name="category" placeholder="Category" className="field-input" />
          <input name="notes" placeholder="Notes" className="field-input" />
          <button type="submit" className="btn-primary">
            Add tool
          </button>
        </form>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Status</th>
                <th>Holder</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                    <div className="muted">{t.assetTag} · {t.category}</div>
                  </td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                  <td>{nameOf(t.checkedOutToId)}</td>
                  <td>
                    {t.status === "available" ? (
                      <div className="cred-edit">
                        <select id={`job-${t.id}`} className="field-input">
                          <option value="">No job</option>
                          {jobs.map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.title}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => checkout(t.id)}
                        >
                          Check out
                        </button>
                      </div>
                    ) : t.status === "checked_out" ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => checkin(t.id)}
                      >
                        Check in
                      </button>
                    ) : (
                      <span className="muted">{t.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          Open checkouts: {checkouts.filter((c) => !c.checkedInAt).length}
        </p>
      </div>
    </RequireAuth>
  );
}
