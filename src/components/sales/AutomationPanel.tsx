"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { fetchJson, loadAppData, mutateAppData } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type {
  SalesSequence,
  SequenceEnrollment,
  WorkflowDefinition,
  WorkflowRun,
} from "@/lib/types";
import { processSequenceSteps } from "@/lib/workflows";

export function AutomationPanel() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [sequences, setSequences] = useState<SalesSequence[]>([]);
  const [enrollments, setEnrollments] = useState<SequenceEnrollment[]>([]);

  async function refresh() {
    const d = await loadAppData();
    setWorkflows(d.workflows);
    setRuns(d.workflowRuns.slice(0, 10));
    setSequences(d.sequences);
    setEnrollments(d.sequenceEnrollments);
    if (!isStaticDemo()) {
      try {
        const json = await fetchJson<{
          workflows: WorkflowDefinition[];
          workflowRuns: WorkflowRun[];
          sequences: SalesSequence[];
          sequenceEnrollments: SequenceEnrollment[];
        }>("/api/workflows");
        setWorkflows(json.workflows);
        setRuns(json.workflowRuns);
        setSequences(json.sequences);
        setEnrollments(json.sequenceEnrollments);
      } catch {
        /* local */
      }
    }
  }

  useEffect(() => {
    void refresh();
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

  async function processDue() {
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        processSequenceSteps(d);
      });
    } else {
      await fetchJson("/api/workflows", {
        method: "POST",
        body: JSON.stringify({ action: "process_sequences" }),
      });
    }
    await refresh();
  }

  return (
    <div className="jarvis-panel-stack">
      <p className="text-sm text-[var(--muted)]">
        Workflows run on lead events and shift posts. Sequences drip email/call steps.
        GoDaddy business email can connect here later for live sends.
      </p>

      <section className="jarvis-glass-panel">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="jarvis-panel-title">Workflows</h3>
          <button type="button" className="btn-secondary !py-1 !text-xs" onClick={processDue}>
            Run due sequences
          </button>
        </div>
        <div className="space-y-3">
          {workflows.map((wf) => (
            <article key={wf.id} className="jarvis-card">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-semibold">{wf.name}</p>
                  <p className="text-xs text-[var(--muted)]">{wf.description}</p>
                </div>
                <div className="flex gap-2">
                  <StatusBadge status={wf.enabled ? "enabled" : "disabled"} />
                  <button type="button" className="linkish text-xs" onClick={() => toggle(wf.id)}>
                    {wf.enabled ? "Pause" : "Enable"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="jarvis-glass-panel">
        <h3 className="jarvis-panel-title">Sequences</h3>
        {sequences.map((seq) => (
          <article key={seq.id} className="jarvis-card mb-3">
            <p className="font-semibold">{seq.name}</p>
            <p className="text-xs text-[var(--muted)]">{seq.description}</p>
            <p className="mt-2 text-xs">
              Active enrollments:{" "}
              {enrollments.filter((e) => e.sequenceId === seq.id && e.status === "active").length}
            </p>
          </article>
        ))}
      </section>

      {runs.length ? (
        <section className="jarvis-glass-panel">
          <h3 className="jarvis-panel-title">Recent runs</h3>
          <ul className="space-y-2 text-sm">
            {runs.map((run) => (
              <li key={run.id} className="text-[var(--muted)]">
                {run.status} · {run.trigger} · {new Date(run.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
