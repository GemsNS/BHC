"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
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
import type {
  InvoiceDoc,
  InvoiceKind,
  Job,
  JobProgressEntry,
  MaterialCost,
} from "@/lib/types";
import { useSession } from "@/lib/session";
import { formatCurrency } from "@/lib/utils";

export default function InvoicesAdminPage() {
  const { user, can } = useSession();
  const [invoices, setInvoices] = useState<InvoiceDoc[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [progress, setProgress] = useState<JobProgressEntry[]>([]);
  const [materials, setMaterials] = useState<MaterialCost[]>([]);
  const [selected, setSelected] = useState<InvoiceDoc | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    if (isStaticDemo()) {
      const d = await loadAppData();
      setInvoices(d.invoices);
      setJobs(d.jobs);
      setProgress(d.jobProgress);
      setMaterials(d.materials);
      return;
    }
    try {
      const json = await fetchJson<{
        invoices: InvoiceDoc[];
        jobs: Job[];
        progress: JobProgressEntry[];
        materials: MaterialCost[];
      }>("/api/invoices");
      setInvoices(json.invoices);
      setJobs(json.jobs);
      setProgress(json.progress);
      setMaterials(json.materials);
    } catch {
      const d = await loadAppData();
      setInvoices(d.invoices);
      setJobs(d.jobs);
      setProgress(d.jobProgress);
      setMaterials(d.materials);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    setMessage(null);
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const kind = String(form.get("kind") || "invoice") as InvoiceKind;
    const jobId = String(form.get("jobId") || "");
    const payload = {
      jobId,
      kind,
      createdById: user.id,
      notes: String(form.get("notes") || ""),
      includeProgress: kind === "full_report",
      autoLinesFromMaterials: form.get("autoLines") === "on",
      runAi: form.get("runAi") === "on" && can("ai_summarize"),
    };

    if (isStaticDemo()) {
      await mutateAppData((d) => {
        const job = d.jobs.find((j) => j.id === jobId);
        if (!job) return;
        const lines = payload.autoLinesFromMaterials
          ? d.materials
              .filter((m) => m.jobId === jobId)
              .map((m) => ({
                id: clientNewId(),
                description: m.description,
                quantity: m.quantity,
                unitPrice: m.unitCost,
              }))
          : [
              {
                id: clientNewId(),
                description: `${job.title} — billing`,
                quantity: 1,
                unitPrice: job.contractValue || job.estimatedValue || 0,
              },
            ];
        const progressEntryIds = payload.includeProgress
          ? d.jobProgress.filter((p) => p.jobId === jobId).map((p) => p.id)
          : [];
        d.invoices.unshift({
          id: clientNewId(),
          jobId,
          kind,
          status: "draft",
          customerName: job.customerName,
          lines: lines.length
            ? lines
            : [
                {
                  id: clientNewId(),
                  description: job.title,
                  quantity: 1,
                  unitPrice: 0,
                },
              ],
          includeProgress: payload.includeProgress,
          progressEntryIds,
          notes: payload.notes,
          aiSummary: null,
          createdAt: clientNowIso(),
          createdById: user.id,
        });
      });
      if (payload.runAi) {
        try {
          const res = await fetchJson<{ summary: string }>("/api/ai/summarize", {
            method: "POST",
            body: JSON.stringify({ jobId }),
          });
          await mutateAppData((d) => {
            if (d.invoices[0]) d.invoices[0].aiSummary = res.summary;
          });
        } catch {
          /* local draft without AI */
        }
      }
    } else {
      await fetchJson("/api/invoices", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    formEl.reset();
    setMessage("Document created.");
    await refresh();
  }

  const jobTitle = (id: string) => jobs.find((j) => j.id === id)?.title || id;
  const selectedProgress = useMemo(() => {
    if (!selected) return [];
    return progress.filter((p) => selected.progressEntryIds.includes(p.id));
  }, [selected, progress]);

  return (
    <RequireAuth perm="invoices">
      <div>
        <PageHeader
          title="Invoices & job reports"
          subtitle="Simple invoice vs full job report with progress notes and photos."
        />

        <form onSubmit={onCreate} className="form-grid">
          <h2>Create document</h2>
          <select name="jobId" required className="field-input" defaultValue="">
            <option value="" disabled>
              Job
            </option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} — {j.customerName}
              </option>
            ))}
          </select>
          <select name="kind" className="field-input" defaultValue="invoice">
            <option value="invoice">Invoice (line items)</option>
            <option value="full_report">Full job report (+ progress)</option>
          </select>
          <input name="notes" placeholder="Internal / customer notes" className="field-input" />
          <label className="board-pin">
            <input type="checkbox" name="autoLines" defaultChecked />
            Pull line items from job materials
          </label>
          {can("ai_summarize") ? (
            <label className="board-pin">
              <input type="checkbox" name="runAi" defaultChecked />
              AI summarize progress into report
            </label>
          ) : null}
          <button type="submit" className="btn-primary">
            Create
          </button>
        </form>
        {message ? <p className="knocker-msg">{message}</p> : null}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const total = inv.lines.reduce(
                  (s, l) => s + l.quantity * l.unitPrice,
                  0,
                );
                return (
                  <tr key={inv.id}>
                    <td>
                      <strong>{jobTitle(inv.jobId)}</strong>
                      <div className="muted">{inv.customerName}</div>
                    </td>
                    <td>
                      <StatusBadge status={inv.kind} />
                    </td>
                    <td>
                      <StatusBadge status={inv.status} />
                    </td>
                    <td>{formatCurrency(total)}</td>
                    <td>
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => setSelected(inv)}
                      >
                        Preview
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selected ? (
          <div className="cc-panel mt-4">
            <header className="cc-panel-head">
              <h2 className="cc-panel-title">
                {selected.kind === "full_report" ? "Job report" : "Invoice"}{" "}
                preview
              </h2>
              <button
                type="button"
                className="cc-topbar-link"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </header>
            <p className="muted">
              {selected.customerName} · {jobTitle(selected.jobId)}
            </p>
            <ul className="mt-3 space-y-1">
              {selected.lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-4 text-sm">
                  <span>
                    {l.description} × {l.quantity}
                  </span>
                  <span>{formatCurrency(l.quantity * l.unitPrice)}</span>
                </li>
              ))}
            </ul>
            {selected.aiSummary ? (
              <pre className="cc-ai-summary mt-4">{selected.aiSummary}</pre>
            ) : null}
            {selected.includeProgress ? (
              <div className="mt-4 grid gap-3">
                <h3 className="font-[family-name:var(--font-display)] text-xl">
                  Progress included
                </h3>
                {selectedProgress.map((p) => (
                  <div key={p.id} className="board-card">
                    <p className="board-body">{p.notes}</p>
                    {p.imageDataUrls.length ? (
                      <div className="cc-image-grid">
                        {p.imageDataUrls.map((src, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={i}
                            src={src}
                            alt=""
                            className="cc-image-thumb-static"
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {!selectedProgress.length ? (
                  <p className="cc-empty">No progress entries linked.</p>
                ) : null}
              </div>
            ) : null}
            <p className="muted mt-3">
              Materials on job:{" "}
              {materials.filter((m) => m.jobId === selected.jobId).length}
            </p>
          </div>
        ) : null}
      </div>
    </RequireAuth>
  );
}
