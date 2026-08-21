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
import type { Job, JobProgressEntry } from "@/lib/types";
import { useSession } from "@/lib/session";

export default function AppsProgressPage() {
  const { user, can } = useSession();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [entries, setEntries] = useState<JobProgressEntry[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const d = await loadAppData();
    setJobs(d.jobs);
    setEntries(d.jobProgress.slice(0, 20));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const runAi = form.get("runAi") === "on" && can("ai_summarize");
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
          ...payload,
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
    setMessage("Saved.");
    await refresh();
  }

  return (
    <AppsShell title="Progress">
      <RequireAuth perm="progress">
        <h1 className="apps-page-heading">Job progress</h1>
        <form onSubmit={onCreate} className="knocker-form">
          <h2>Update + photos</h2>
          <select name="jobId" required className="field-input" defaultValue="">
            <option value="" disabled>
              Job
            </option>
            {jobs
              .filter((j) =>
                ["scheduled", "in_progress", "on_hold"].includes(j.status),
              )
              .map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
          </select>
          <textarea
            name="notes"
            required
            rows={3}
            placeholder="Notes for today"
            className="field-input"
          />
          <ImagePicker previews={images} onChange={setImages} />
          {can("ai_summarize") ? (
            <label className="board-pin">
              <input type="checkbox" name="runAi" defaultChecked />
              AI summarize
            </label>
          ) : null}
          <button type="submit" className="btn-primary btn-block">
            Save
          </button>
          {message ? <p className="knocker-msg">{message}</p> : null}
        </form>
        <section className="knocker-recent">
          <h3>Recent</h3>
          <ul>
            {entries.slice(0, 8).map((e) => (
              <li key={e.id}>
                <div>
                  <span className="font-medium">{e.notes.slice(0, 80)}</span>
                </div>
                <p>
                  {e.imageDataUrls.length} photo(s) ·{" "}
                  {new Date(e.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </RequireAuth>
    </AppsShell>
  );
}
