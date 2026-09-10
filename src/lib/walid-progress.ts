/**
 * Server-only: import Walid field photos + crew hours into CRM.
 * Keep filesystem I/O out of walid-crm.ts so production-seed can ship in the client bundle.
 */

import { readFile } from "fs/promises";
import path from "path";
import { DEFAULT_STAFF_PIN } from "./auth-credentials";
import { storeNamedMedia } from "./media-store";
import type { AppData, Employee, JobProgressEntry, TimeEntry } from "./types";
import { ensureWalidInCrm, WALID_CRM } from "./walid-crm";

type DayManifest = {
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

export type ImportWalidDay2Result = {
  photoUrls: string[];
  entryIds: string[];
  jobStatus: string;
};

export type ImportWalidHoursResult = {
  employeeIds: string[];
  timeEntryIds: string[];
  days: string[];
  hoursPerShift: number;
};

function atlanticIso(date: string, hhmm: string): string {
  // Store as Atlantic offset (−03:00 ADT in September) so job hub math is stable.
  const [h, m] = hhmm.split(":").map(Number);
  return `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000-03:00`;
}

function shiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

/** Ensure Rylee / Christopher / Cameron exist as active field staff (idempotent). */
export function ensureWalidCrew(data: AppData, nowIso?: string): string[] {
  const hireDate = (nowIso ?? new Date().toISOString()).slice(0, 10);
  const ids: string[] = [];
  for (const row of WALID_CRM.crew) {
    ids.push(row.id);
    const existing = data.employees.find((e) => e.id === row.id);
    if (existing) {
      existing.name = row.name;
      existing.active = true;
      if (!existing.role) existing.role = "field";
      continue;
    }
    const byLogin = data.employees.find((e) => e.login === row.login);
    if (byLogin && byLogin.id !== row.id) {
      // Keep their login unique — rename login on the stable crew id only.
    }
    const emp: Employee = {
      id: row.id,
      name: row.name,
      email: `${row.login}@bhcontracting.ca`,
      login: row.login,
      pin: DEFAULT_STAFF_PIN,
      passwordHash: null,
      mustChangePassword: true,
      role: "field",
      phone: "",
      hireDate,
      hourlyRate: 26,
      active: true,
    };
    // Avoid duplicate login collisions with role accounts.
    if (data.employees.some((e) => e.login === emp.login && e.id !== emp.id)) {
      emp.login = `${row.login}.field`;
      emp.email = `${row.login}.field@bhcontracting.ca`;
    }
    data.employees.push(emp);
  }
  return ids;
}

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
  const manifest = JSON.parse(raw) as DayManifest;
  const dayLabel = manifest.title ?? "Day 1 — site progress";
  const dayDate = manifest.date ?? WALID_CRM.day1Date;
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

/**
 * Day 2 house-wrap / window progress. Idempotent.
 */
export async function importWalidDay2Progress(
  data: AppData,
  opts: { authorId?: string; nowIso?: string; photosDir?: string } = {},
): Promise<ImportWalidDay2Result> {
  ensureWalidInCrm(data, { nowIso: opts.nowIso, authorId: opts.authorId });
  ensureWalidCrew(data, opts.nowIso);

  const authorId = opts.authorId ?? "emp-cameron-field";
  const dir = path.resolve(process.cwd(), opts.photosDir ?? WALID_CRM.fieldPhotosDay2Dir);
  const raw = await readFile(path.join(dir, "manifest.json"), "utf8");
  const manifest = JSON.parse(raw) as DayManifest;
  const dayLabel = manifest.title ?? "Day 2 — house wrap / windows";
  const dayDate = manifest.date ?? WALID_CRM.day2Date;
  const noteLines = manifest.notes?.length
    ? manifest.notes
    : [
        "Day 2 on site — NovaWrap / house wrap and window install.",
        "Back wall wrap complete except right-side window cut/wrap remaining.",
        "Right elevation about half wrapped.",
      ];

  const photoUrls: string[] = [];
  for (const photo of manifest.photos) {
    const buf = await readFile(path.join(dir, photo.file));
    const mediaName = `walid-day2-${photo.file.replace(/\.jpeg$/i, ".jpg")}`;
    photoUrls.push(await storeNamedMedia(buf, mediaName));
  }

  const entryId = WALID_CRM.day2ProgressIds[0];
  const entry: JobProgressEntry = {
    id: entryId,
    jobId: WALID_CRM.jobId,
    authorId,
    notes: [`${dayLabel} — ${dayDate}`, ...noteLines].join("\n"),
    imageDataUrls: photoUrls,
    aiSummary:
      "House wrap (NovaWrap) largely complete on back wall; right elevation ~50%; window on right still needs cut-out and wrap detailing.",
    createdAt: data.jobProgress.find((p) => p.id === entryId)?.createdAt ?? `${dayDate}T18:30:00.000Z`,
  };
  const idx = data.jobProgress.findIndex((p) => p.id === entryId);
  if (idx >= 0) data.jobProgress[idx] = entry;
  else data.jobProgress.unshift(entry);

  const job = data.jobs.find((j) => j.id === WALID_CRM.jobId);
  if (job && job.status !== "completed" && job.status !== "invoiced") {
    job.status = "in_progress";
    const progressBlurb =
      `Progress: Day 2 (${dayDate}) — Crew Rylee, Christopher & Cameron 10:30–18:30. ` +
      `Back wall NovaWrap complete except right-side window still needs cut/wrap. Right elevation ~half wrapped.`;
    if (!job.notes.includes("Progress: Day 2")) {
      job.notes = `${job.notes}\n\n${progressBlurb}`.trim();
    } else {
      job.notes = job.notes.replace(/Progress: Day 2[\s\S]*?(?=\n\nProgress:|$)/, progressBlurb).trim();
    }
  }

  return {
    photoUrls,
    entryIds: [entryId],
    jobStatus: job?.status ?? "in_progress",
  };
}

type WalidDayKey = "day1" | "day2";

function crewForDay(dayKey: WalidDayKey) {
  const ids = dayKey === "day1" ? WALID_CRM.day1CrewIds : WALID_CRM.day2CrewIds;
  return WALID_CRM.crew.filter((m) => (ids as readonly string[]).includes(m.id));
}

function shiftForDay(dayKey: WalidDayKey): { start: string; end: string } {
  return dayKey === "day1"
    ? { start: WALID_CRM.day1ShiftStart, end: WALID_CRM.day1ShiftEnd }
    : { start: WALID_CRM.day2ShiftStart, end: WALID_CRM.day2ShiftEnd };
}

/**
 * Clock crew onto job-walid:
 *   Day 1 — Christopher & Cameron 08:00–14:00
 *   Day 2 — Rylee, Christopher & Cameron 10:30–18:30
 * Idempotent stable time-entry ids. Removes stale Day 1 Rylee row if present.
 */
export function importWalidCrewHours(
  data: AppData,
  opts: { nowIso?: string; days?: WalidDayKey[] } = {},
): ImportWalidHoursResult {
  ensureWalidInCrm(data, { nowIso: opts.nowIso });
  ensureWalidCrew(data, opts.nowIso);
  const days = opts.days?.length ? opts.days : (["day1", "day2"] as WalidDayKey[]);
  const dayDates: Record<WalidDayKey, string> = {
    day1: WALID_CRM.day1Date,
    day2: WALID_CRM.day2Date,
  };
  const timeEntryIds: string[] = [];
  const recordedDays: string[] = [];
  const employeeIdSet = new Set<string>();

  // Drop incorrect Day 1 Rylee entry from the earlier all-crew import.
  data.timeEntries = data.timeEntries.filter((t) => t.id !== "time-walid-day1-rylee");

  for (const dayKey of days) {
    const date = dayDates[dayKey];
    recordedDays.push(date);
    const shift = shiftForDay(dayKey);
    for (const member of crewForDay(dayKey)) {
      employeeIdSet.add(member.id);
      const id = `time-walid-${dayKey}-${member.id.replace(/^emp-/, "")}`;
      timeEntryIds.push(id);
      const entry: TimeEntry = {
        id,
        employeeId: member.id,
        clockIn: atlanticIso(date, shift.start),
        clockOut: atlanticIso(date, shift.end),
        jobId: WALID_CRM.jobId,
        notes: `Walid / SOI Trade Uniacke — ${dayKey === "day1" ? "Day 1" : "Day 2"} field shift (${shift.start}–${shift.end}).`,
      };
      const idx = data.timeEntries.findIndex((t) => t.id === id);
      if (idx >= 0) data.timeEntries[idx] = entry;
      else data.timeEntries.unshift(entry);
    }
  }

  const day1Hours = shiftHours(WALID_CRM.day1ShiftStart, WALID_CRM.day1ShiftEnd);
  const day2Hours = shiftHours(WALID_CRM.day2ShiftStart, WALID_CRM.day2ShiftEnd);
  const job = data.jobs.find((j) => j.id === WALID_CRM.jobId);
  if (job) {
    const hoursNote =
      `Crew hours: Day 1 (${WALID_CRM.day1Date}) Christopher & Cameron ${WALID_CRM.day1ShiftStart}–${WALID_CRM.day1ShiftEnd} (${day1Hours}h each). ` +
      `Day 2 (${WALID_CRM.day2Date}) Rylee, Christopher & Cameron ${WALID_CRM.day2ShiftStart}–${WALID_CRM.day2ShiftEnd} (${day2Hours}h each).`;
    if (!job.notes.includes("Crew hours:")) {
      job.notes = `${job.notes}\n\n${hoursNote}`.trim();
    } else {
      job.notes = job.notes
        .replace(/Crew hours:[\s\S]*?(?=\n\n[A-Z]|$)/, hoursNote)
        .trim();
    }
  }

  return {
    employeeIds: [...employeeIdSet],
    timeEntryIds,
    days: recordedDays,
    hoursPerShift: day2Hours,
  };
}
