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

type WalidCrewRow = (typeof WALID_CRM.crew)[number];

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function firstName(s: string): string {
  return normName(s).split(" ")[0] ?? "";
}

/** First names / aliases we treat as referring to an existing employee. */
function referredFirstNames(row: WalidCrewRow): string[] {
  const names = new Set<string>();
  const add = (raw: string) => {
    const f = firstName(raw);
    if (f) names.add(f);
  };
  add(row.name);
  for (const n of row.matchNames) add(n);
  return [...names];
}

/**
 * Prefer an existing DB employee when the operator used a first name.
 * Match order: exact full name → first-name hit → login alias → preferred stub id.
 */
function findExistingCrewMember(data: AppData, row: WalidCrewRow): Employee | undefined {
  const matchNames = row.matchNames.map(normName);
  const matchLogins = new Set(
    [row.login, ...(row.matchLogins ?? [])].map((l) => l.toLowerCase()),
  );
  const firstNames = referredFirstNames(row);
  const stubIds = new Set(WALID_CRM.crew.map((c) => c.id));

  const rank = (e: Employee): number => {
    let score = 0;
    if (e.active) score += 100;
    if (e.id !== row.id && !stubIds.has(e.id)) score += 50; // prefer live rows over Walid stubs
    if (e.role === "field") score += 10;
    score += Math.min(normName(e.name).split(" ").length, 5); // fuller legal names win
    return score;
  };

  const bestOf = (candidates: Employee[]): Employee | undefined => {
    if (!candidates.length) return undefined;
    return [...candidates].sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name))[0];
  };

  // 1) Exact full-name match (Christopher Ryan Scott, etc.).
  for (const needle of matchNames) {
    const hits = data.employees.filter((e) => normName(e.name) === needle);
    const hit = bestOf(hits);
    if (hit) return hit;
  }

  // 2) Multi-token containment (christopher + scott).
  for (const needle of matchNames) {
    const tokens = needle.split(" ").filter((t) => t.length > 2);
    if (tokens.length < 2) continue;
    const hits = data.employees.filter((e) => {
      const n = normName(e.name);
      return tokens.every((t) => n.includes(t));
    });
    const hit = bestOf(hits);
    if (hit) return hit;
  }

  // 3) First-name match — "Cameron" → existing Cameron Brown / Cameron …, etc.
  {
    const hits = data.employees.filter((e) => {
      if (e.id === row.id) return false; // don't treat the stub as the live match
      return firstNames.includes(firstName(e.name));
    });
    const hit = bestOf(hits);
    if (hit) return hit;
  }

  // 4) Login aliases (chris / christopher.scott / cameron).
  {
    const hits = data.employees.filter(
      (e) => e.id !== row.id && matchLogins.has(e.login.toLowerCase()),
    );
    const hit = bestOf(hits);
    if (hit) return hit;
  }

  // 5) Preferred stub id already present (only when no live person matched).
  return data.employees.find((e) => e.id === row.id);
}

/** Remap every known employee-id foreign key, then delete the duplicate stub. */
function remappingEmployeeId(data: AppData, fromId: string, toId: string) {
  if (fromId === toId) return;

  const rewrite = (value: string | null | undefined): string | null | undefined => {
    if (value === fromId) return toId;
    return value;
  };

  for (const t of data.timeEntries) {
    if (t.employeeId === fromId) t.employeeId = toId;
  }
  for (const p of data.jobProgress) {
    if (p.authorId === fromId) p.authorId = toId;
  }
  for (const a of data.activities) {
    if (a.authorId === fromId) a.authorId = toId;
  }
  for (const j of data.jobs) {
    if (j.crewLeadId === fromId) j.crewLeadId = toId;
  }
  for (const l of data.leads) {
    if (l.assignedToId === fromId) l.assignedToId = toId;
  }
  for (const d of data.deals) {
    if (d.ownerId === fromId) d.ownerId = toId;
  }
  for (const s of data.shifts) {
    if (s.employeeId === fromId) s.employeeId = toId;
    if (s.postedById === fromId) s.postedById = toId;
    if (s.claimedById === fromId) s.claimedById = toId;
  }
  for (const k of data.knocks) {
    if (k.knockerId === fromId) k.knockerId = toId;
    if (Array.isArray(k.visitedByIds)) {
      k.visitedByIds = k.visitedByIds.map((id) => (id === fromId ? toId : id));
    }
  }
  for (const t of data.tickets) {
    if (t.assigneeId === fromId) t.assigneeId = toId;
  }
  for (const tok of data.passwordResetTokens) {
    if (tok.employeeId === fromId) tok.employeeId = toId;
  }

  // Delete the duplicate stub account entirely (do not leave an inactive twin).
  data.employees = data.employees.filter((e) => e.id !== fromId);
  void rewrite;
}

/**
 * Resolve Rylee / Christopher / Cameron to real employee ids.
 * If the operator named someone by first name and that person already exists,
 * bind hours to them — never mint a parallel stub. Idempotent: remaps + deletes stubs.
 */
export function ensureWalidCrew(data: AppData, nowIso?: string): string[] {
  const hireDate = (nowIso ?? new Date().toISOString()).slice(0, 10);
  const ids: string[] = [];
  for (const row of WALID_CRM.crew) {
    let emp = findExistingCrewMember(data, row);

    // Stub present alongside a live first-name match — always prefer the live user.
    if (emp && emp.id === row.id) {
      const live = findExistingCrewMember(
        { ...data, employees: data.employees.filter((e) => e.id !== row.id) },
        row,
      );
      if (live) {
        remappingEmployeeId(data, row.id, live.id);
        emp = live;
      }
    }

    if (!emp) {
      emp = {
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
      if (data.employees.some((e) => e.login === emp!.login && e.id !== emp!.id)) {
        emp.login = `${row.login}.field`;
        emp.email = `${row.login}.field@bhcontracting.ca`;
      }
      data.employees.push(emp);
    } else if (emp.id !== row.id) {
      // Live person matched — fold any leftover stub into them and delete it.
      remappingEmployeeId(data, row.id, emp.id);
    } else {
      // Only the stub exists (no live person with this first name yet).
      emp.active = true;
      if (!emp.role) emp.role = "field";
      if (normName(emp.name) !== normName(row.name) && firstName(emp.name) === firstName(row.name)) {
        // Keep short first-name stubs as-is unless canonical name is richer.
        if (normName(row.name).split(" ").length > 1) emp.name = row.name;
      }
    }

    ids.push(emp.id);
  }
  return ids;
}

/** Map preferred crew id → resolved live employee id after ensureWalidCrew. */
export function resolveWalidCrewIds(data: AppData, nowIso?: string): Map<string, string> {
  ensureWalidCrew(data, nowIso);
  const map = new Map<string, string>();
  for (const row of WALID_CRM.crew) {
    const emp = findExistingCrewMember(data, row) ?? data.employees.find((e) => e.id === row.id);
    map.set(row.id, emp?.id ?? row.id);
  }
  return map;
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
      job.notes = job.notes.replace(/Progress: Day 2[\s\S]*?(?=\n\n(?:Progress:|Crew hours:)|$)/, progressBlurb).trim();
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
  const crewIds = resolveWalidCrewIds(data, opts.nowIso);
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
      const employeeId = crewIds.get(member.id) ?? member.id;
      employeeIdSet.add(employeeId);
      // Stable entry ids keep the preferred crew suffix (chris), not the live emp uuid.
      const id = `time-walid-${dayKey}-${member.id.replace(/^emp-/, "")}`;
      timeEntryIds.push(id);
      const entry: TimeEntry = {
        id,
        employeeId,
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
        .replace(/Crew hours:[\s\S]*?(?=\n\n(?:Progress:|[A-Z])|$)/, hoursNote)
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
