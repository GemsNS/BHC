"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { fetchJson, loadAppData, mutateAppData } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import { processSequenceSteps } from "@/lib/workflows";
import type { SalesSequence, SequenceEnrollment } from "@/lib/types";

export default function SequencesPage() {
  const [sequences, setSequences] = useState<SalesSequence[]>([]);
  const [enrollments, setEnrollments] = useState<SequenceEnrollment[]>([]);

  async function refresh() {
    const d = await loadAppData();
    setSequences(d.sequences);
    setEnrollments(d.sequenceEnrollments);
    if (!isStaticDemo()) {
      try {
        const json = await fetchJson<{
          sequences: SalesSequence[];
          sequenceEnrollments: SequenceEnrollment[];
        }>("/api/workflows");
        setSequences(json.sequences);
        setEnrollments(json.sequenceEnrollments);
      } catch {
        /* local */
      }
    }
  }

  useEffect(() => {
    refresh();
  }, []);

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
    <div>
      <PageHeader
        title="Sales sequences"
        subtitle="Automated email, call, and task drips for new leads — enroll via workflows."
      />

      <button
        type="button"
        onClick={processDue}
        className="mb-6 rounded-md bg-[var(--amber)] px-4 py-2 font-semibold text-[var(--ink)]"
      >
        Process due sequence steps
      </button>

      {sequences.map((seq) => (
        <article
          key={seq.id}
          className="mb-6 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"
        >
          <h2 className="text-lg font-semibold">{seq.name}</h2>
          <p className="text-sm text-[var(--muted)]">{seq.description}</p>
          <ol className="mt-4 space-y-2 border-l border-[var(--line)] pl-4">
            {seq.steps.map((step) => (
              <li key={step.id} className="text-sm">
                <span className="text-xs uppercase text-[var(--muted)]">
                  Day {step.delayDays} · {step.type}
                </span>
                <p className="font-medium">{step.subject}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Active enrollments:{" "}
            {enrollments.filter((e) => e.sequenceId === seq.id && e.status === "active").length}
          </p>
        </article>
      ))}
    </div>
  );
}
