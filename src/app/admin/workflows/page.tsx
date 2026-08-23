"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { fetchJson, loadAppData, mutateAppData } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { WorkflowDefinition, WorkflowRun } from "@/lib/types";
import { runSingleWorkflow } from "@/lib/workflows";

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);

  async function refresh() {
    const d = await loadAppData();
    setWorkflows(d.workflows);
    setRuns(d.workflowRuns.slice(0, 20));
    if (!isStaticDemo()) {
      try {
        const json = await fetchJson<{
          workflows: WorkflowDefinition[];
          workflowRuns: WorkflowRun[];
        }>("/api/workflows");
        setWorkflows(json.workflows);
        setRuns(json.workflowRuns);
      } catch {
        /* local */
      }
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function toggle(id: string) {
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        const wf = d.workflows.find((w) => w.id === id);
        if (wf) wf.enabled = !wf.enabled;
      });
    } else {
      await fetchJson("/api/workflows", {
        method: "POST",
        body: JSON.stringify({ action: "toggle", id }),
      });
    }
    await refresh();
  }

  async function runDemo(workflowId: string, leadId: string) {
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        runSingleWorkflow(d, workflowId, { leadId, leadStatus: "qualified" });
      });
    } else {
      await fetchJson("/api/workflows", {
        method: "POST",
        body: JSON.stringify({
          action: "run_manual",
          workflowId,
          context: { leadId },
        }),
      });
    }
    await refresh();
  }

  return (
    <div>
      <PageHeader
        title="Workflows"
        subtitle="Automated triggers for leads, shifts, and outreach — HubSpot-style workflow engine."
      />

      <div className="mb-8 space-y-4">
        {workflows.map((wf) => (
          <article
            key={wf.id}
            className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{wf.name}</h2>
                <p className="text-sm text-[var(--muted)]">{wf.description}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-[var(--muted)]">
                  Trigger: {wf.trigger.replace(/_/g, " ")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={wf.enabled ? "enabled" : "disabled"} />
                <button
                  type="button"
                  onClick={() => toggle(wf.id)}
                  className="rounded-md border border-[var(--line)] px-3 py-1 text-xs"
                >
                  {wf.enabled ? "Disable" : "Enable"}
                </button>
                {wf.trigger.includes("lead") ? (
                  <button
                    type="button"
                    onClick={() => runDemo(wf.id, "lead-3")}
                    className="rounded-md bg-[var(--amber)] px-3 py-1 text-xs font-semibold text-[var(--ink)]"
                  >
                    Run on demo lead
                  </button>
                ) : null}
              </div>
            </div>
            <ul className="mt-3 list-inside list-disc text-sm text-[var(--muted)]">
              {wf.actions.map((a, i) => (
                <li key={i}>
                  {a.type.replace(/_/g, " ")}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl">
        Recent runs
      </h2>
      <ul className="space-y-2 text-sm">
        {runs.map((run) => (
          <li
            key={run.id}
            className="rounded-md border border-[var(--line)] px-3 py-2"
          >
            <span className="font-medium">{run.status}</span> · {run.trigger} ·{" "}
            {new Date(run.createdAt).toLocaleString()}
            {run.log.length ? (
              <ul className="mt-1 list-inside list-disc text-xs text-[var(--muted)]">
                {run.log.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
