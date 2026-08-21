"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
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
import type { Employee, Job, JobProgressEntry } from "@/lib/types";
import { useSession } from "@/lib/session";

export default function ProgressAdminPage() {
  const { user, can } = useSession();
  const [entries, setEntries] = useState<JobProgressEntry[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [jobFilter, setJobFilter] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    if (isStaticDemo()) {
      const d = await loadAppData();
      setEntries(d.jobProgress);
      setJobs(d.jobs);
      setEmployees(d.employees);
      return;
    }
    try {
      const json = await fetchJson<{
        entries: JobProgressEntry[];
        jobs: Job[];
        employees: Employee[];
      }>("/api/progress");
      setEntries(json.entries);
      setJobs(json.jobs);
      setEmployees(json.employees);
    } catch {
      const d = await loadAppData();
      setEntries(d.jobProgress);
      setJobs(d.jobs);
      setEmployees(d.employees);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const visible = useMemo(
    () =>
      (jobFilter
        ? entries.filter((e) => e.jobId === jobFilter)
        : entries
      ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entries, jobFilter],
  );

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    setMessage(null);
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const runAi = form.get("runAi") === "on";
    const payload = {
      jobId: String(form.get("jobId") || ""),
      authorId: user.id,
      notes: String(form.get("notes") || ""),
      imageDataUrls: images,
      runAi,
    };
    if (isStaticDemo()) {
      let aiSummary: string | null = null;
      if (runAi) {
        try {
          const res = await fetchJson<{ summary: string }>("/api/ai/summarize", {
            method: "POST",
            body: JSON.stringify({
              jobId: payload.jobId,
              notes: [payload.notes],
              imageCount: images.length,
            }),
          });
          aiSummary = res.summary;
        } catch {
          aiSummary = `• ${payload.notes}`;
        }
      }
      await mutateAppData((d) => {
        d.jobProgress.unshift({
          id: clientNewId(),
          jobId: payload.jobId,
          authorId: payload.authorId,
          notes: payload.notes,
          imageDataUrls: payload.imageDataUrls,
          aiSummary,
          createdAt: clientNowIso(),
        });
      });
    } else {
      await fetchJson("/api/progress", {
        method: "POST",
        body: JSON.stringify({ action: "create", ...payload }),
      });
    }
    formEl.reset();
    setImages([]);
    setMessage("Progress saved.");
    await refresh();
  }

  async function summarizeJob(jobId: string) {
    setMessage(null);
    if (isStaticDemo()) {
      try {
        const res = await fetchJson<{ summary: string; source: string }>(
          "/api/ai/summarize",
          { method: "POST", body: JSON.stringify({ jobId }) },
        );
        await mutateAppData((d) => {
          for (const e of d.jobProgress.filter((p) => p.jobId === jobId)) {
            e.aiSummary = res.summary;
          }
        });
        setMessage(`Summary ready (${res.source}).`);
      } catch {
        setMessage("Could not summarize (API unavailable in this mode).");
      }
    } else {
      const res = await fetchJson<{ summary: string; source: string }>(
        "/api/progress",
        { method: "POST", body: JSON.stringify({ action: "summarize", jobId }) },
      );
      setMessage(`Summary ready (${res.source}).`);
    }
    await refresh();
  }

  const author = (id: string) => employees.find((e) => e.id === id)?.name || "Crew";
  const jobTitle = (id: string) => jobs.find((j) => j.id === id)?.title || id;

  return (
    <RequireAuth perm="progress">
      <div>
        <PageHeader
          title="Job progress"
          subtitle="Photos + notes from the field. AI summarize streamlines customer reports."
        />

        <form onSubmit={onCreate} className="form-grid">
          <h2>Log progress</h2>
          <select name="jobId" required className="field-input" defaultValue="">
            <option value="" disabled>
              Select job
            </option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
          <textarea
            name="notes"
            required
            rows={3}
            placeholder="What got done today?"
            className="field-input"
          />
          <div className="sm:col-span-2 lg:col-span-3">
            <ImagePicker previews={images} onChange={setImages} />
          </div>
          {can("ai_summarize") ? (
            <label className="board-pin">
              <input type="checkbox" name="runAi" defaultChecked />
              AI summarize this entry
            </label>
          ) : null}
          <button type="submit" className="btn-primary">
            Save progress
          </button>
        </form>
        {message ? <p className="knocker-msg">{message}</p> : null}

        <div className="mb-4 flex flex-wrap gap-2 items-center">
          <select
            className="field-input"
            style={{ maxWidth: "20rem" }}
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
          >
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
          {jobFilter && can("ai_summarize") ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => summarizeJob(jobFilter)}
            >
              AI summarize job
            </button>
          ) : null}
        </div>

        <ul className="board-list">
          {visible.map((e) => (
            <li key={e.id} className="board-card">
              <div className="board-card-head">
                <h3>{jobTitle(e.jobId)}</h3>
                <span className="muted">{author(e.authorId)}</span>
              </div>
              <p className="board-body">{e.notes}</p>
              {e.aiSummary ? (
                <pre className="cc-ai-summary">{e.aiSummary}</pre>
              ) : null}
              {e.imageDataUrls.length ? (
                <div className="cc-image-grid">
                  {e.imageDataUrls.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={src} alt="" className="cc-image-thumb-static" />
                  ))}
                </div>
              ) : null}
              <div className="board-meta">
                <span>{new Date(e.createdAt).toLocaleString()}</span>
                <span>{e.imageDataUrls.length} photo(s)</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </RequireAuth>
  );
}
