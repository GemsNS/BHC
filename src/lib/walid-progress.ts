/**
 * Server-only: import Walid Day 1 field photos into CRM progress.
 * Keep filesystem I/O out of walid-crm.ts so production-seed can ship in the client bundle.
 */

import { readFile } from "fs/promises";
import path from "path";
import { storeNamedMedia } from "./media-store";
import type { AppData, JobProgressEntry } from "./types";
import { ensureWalidInCrm, WALID_CRM } from "./walid-crm";

type Day1Manifest = {
  day: number;
  date?: string;
  title?: string;
  notes?: string[];
  photos: Array<{ file: string; source?: string; caption?: string }>;
};

export type ImportWalidDay1Result = {
  photoUrls: string[];
  entryIds: string[];
  jobStatus: string;
};

/**
 * Copy compressed Day 1 field photos into data/media and attach JobProgressEntry
 * rows on job-walid. Idempotent — reuses stable media filenames and progress ids.
 */
export async function importWalidDay1Progress(
  data: AppData,
  opts: { authorId?: string; nowIso?: string; photosDir?: string } = {},
): Promise<ImportWalidDay1Result> {
  ensureWalidInCrm(data, { nowIso: opts.nowIso, authorId: opts.authorId });

  const authorId = opts.authorId ?? "emp-field";
  const dir = path.resolve(process.cwd(), opts.photosDir ?? WALID_CRM.fieldPhotosDay1Dir);
  const raw = await readFile(path.join(dir, "manifest.json"), "utf8");
  const manifest = JSON.parse(raw) as Day1Manifest;
  const dayLabel = manifest.title ?? "Day 1 — site progress";
  const dayDate = manifest.date ?? "2026-09-09";
  const noteLines = manifest.notes?.length
    ? manifest.notes
    : [
        "Day 1 on site at 9 Alicia Scott Ave., Mount Uniacke (SOI Trade / Walid warehouse extension).",
        "Field photos from the first work day.",
      ];

  const photoUrls: string[] = [];
  for (const photo of manifest.photos) {
    const buf = await readFile(path.join(dir, photo.file));
    const mediaName = `walid-day1-${photo.file.replace(/\.jpeg$/i, ".jpg")}`;
    photoUrls.push(await storeNamedMedia(buf, mediaName));
  }

  // API/UI caps at 6 photos per entry — split Day 1 into two updates.
  const chunks: Array<{ id: string; urls: string[]; label: string }> = [
    {
      id: WALID_CRM.day1ProgressIds[0],
      urls: photoUrls.slice(0, 6),
      label: `${dayLabel} (photos 1–${Math.min(6, photoUrls.length)})`,
    },
    {
      id: WALID_CRM.day1ProgressIds[1],
      urls: photoUrls.slice(6),
      label: `${dayLabel} (photos 7–${photoUrls.length})`,
    },
  ].filter((c) => c.urls.length > 0);

  const entryIds: string[] = [];
  for (const chunk of chunks) {
    const entry: JobProgressEntry = {
      id: chunk.id,
      jobId: WALID_CRM.jobId,
      authorId,
      notes: [`${chunk.label} — ${dayDate}`, ...noteLines].join("\n"),
      imageDataUrls: chunk.urls,
      aiSummary: null,
      createdAt:
        data.jobProgress.find((p) => p.id === chunk.id)?.createdAt ?? `${dayDate}T18:00:00.000Z`,
    };
    const idx = data.jobProgress.findIndex((p) => p.id === chunk.id);
    if (idx >= 0) data.jobProgress[idx] = entry;
    else data.jobProgress.unshift(entry);
    entryIds.push(chunk.id);
  }

  const job = data.jobs.find((j) => j.id === WALID_CRM.jobId);
  if (job && job.status !== "completed" && job.status !== "invoiced") {
    job.status = "in_progress";
    if (!job.notes.includes("Progress: Day 1")) {
      job.notes = `${job.notes}\n\nProgress: Day 1 (${dayDate}) — ${photoUrls.length} field photo(s) attached.`.trim();
    }
  }

  return {
    photoUrls,
    entryIds,
    jobStatus: job?.status ?? "in_progress",
  };
}
