"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppsShell } from "@/components/AppsShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useSession } from "@/lib/session";
import { fetchJson, loadAppData } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import { sessionHeaders } from "@/lib/session-headers";
import {
  formatDuration,
  LUNCH_DEDUCT_MINUTES,
  paidDurationMs,
} from "@/lib/time-clock";
import type { Job, TimeEntry } from "@/lib/types";

function PortalClockInner() {
  const { user } = useSession();
  const search = useSearchParams();
  const nextPath = search.get("next");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [jobId, setJobId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (isStaticDemo()) {
      const data = await loadAppData();
      setEntries(data.timeEntries);
      setJobs(data.jobs);
      return;
    }
    try {
      const json = await fetchJson<{ timeEntries: TimeEntry[]; jobs: Job[] }>(
        "/api/time-entries",
      );
      setEntries(json.timeEntries);
      setJobs(json.jobs);
    } catch {
      const data = await loadAppData();
      setEntries(data.timeEntries);
      setJobs(data.jobs);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const openEntry = useMemo(
    () =>
      entries.find((e) => e.employeeId === user?.id && e.clockOut === null) ||
      null,
    [entries, user?.id],
  );

  const livePaid = openEntry
    ? formatDuration(paidDurationMs(openEntry.clockIn, null))
    : null;

  async function clock(action: "clock_in" | "clock_out") {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      if (isStaticDemo()) {
        const { mutateAppData, clientNewId, clientNowIso } = await import(
          "@/lib/client-data"
        );
        await mutateAppData((d) => {
          if (action === "clock_in") {
            if (d.timeEntries.some((t) => t.employeeId === user.id && !t.clockOut))
              throw new Error("Already clocked in");
            d.timeEntries.unshift({
              id: clientNewId(),
              employeeId: user.id,
              clockIn: clientNowIso(),
              clockOut: null,
              jobId: jobId || null,
              notes: "",
            });
          } else {
            const open = d.timeEntries.find(
              (t) => t.employeeId === user.id && !t.clockOut,
            );
            if (!open) throw new Error("No open time entry");
            open.clockOut = clientNowIso();
          }
        });
        setMessage(action === "clock_in" ? "Clocked in" : "Clocked out");
      } else {
        const res = await fetch("/api/time-entries", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...sessionHeaders(),
          },
          body: JSON.stringify({
            action,
            employeeId: user.id,
            jobId: jobId || null,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed");
        if (action === "clock_in") {
          setMessage(
            `Clocked in at ${new Date(json.entry.clockIn).toLocaleTimeString()}`,
          );
          if (nextPath && nextPath.startsWith("/")) {
            window.location.href = nextPath;
            return;
          }
        } else {
          setMessage(
            `Clocked out · paid ${json.paidLabel ?? formatDuration(paidDurationMs(json.entry.clockIn, json.entry.clockOut))} (incl. ${LUNCH_DEDUCT_MINUTES}m lunch deduction when applicable)`,
          );
        }
      }
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppsShell title="Time clock">
      <RequireAuth perm="clock">
        <div className="clock-app">
          <div className="clock-status">
            <p>{user?.name}</p>
            <h2>{openEntry ? "ON THE CLOCK" : "OFF SHIFT"}</h2>
            {openEntry ? (
              <>
                <p className="clock-since">
                  Since {new Date(openEntry.clockIn).toLocaleTimeString()}
                </p>
                <p className="clock-since">Paid so far: {livePaid}</p>
              </>
            ) : null}
          </div>

          <p className="text-sm text-[var(--muted)]">
            Clock in before using field tools. Shifts auto-close at 12 hours —
            clock in again to continue. A {LUNCH_DEDUCT_MINUTES}-minute lunch is
            deducted from paid time on punches longer than{" "}
            {LUNCH_DEDUCT_MINUTES} minutes.{" "}
            <Link href="/apps/hours" className="underline">
              Hour tracker
            </Link>
          </p>

          <label className="field">
            <span>Job (optional)</span>
            <select
              className="field-input"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              disabled={!!openEntry}
            >
              <option value="">General / no job</option>
              {jobs
                .filter((j) => ["scheduled", "in_progress"].includes(j.status))
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
            </select>
          </label>

          {!openEntry ? (
            <button
              type="button"
              disabled={busy || !user}
              className="btn-primary btn-block"
              onClick={() => clock("clock_in")}
            >
              Clock in
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              className="btn-secondary btn-block"
              onClick={() => clock("clock_out")}
            >
              Clock out
            </button>
          )}
          {message ? <p className="knocker-msg">{message}</p> : null}
        </div>
      </RequireAuth>
    </AppsShell>
  );
}

export default function PortalPage() {
  return (
    <Suspense
      fallback={
        <AppsShell title="Time clock">
          <p className="text-[var(--muted)]">Loading time clock…</p>
        </AppsShell>
      }
    >
      <PortalClockInner />
    </Suspense>
  );
}
