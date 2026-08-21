"use client";

import { useEffect, useMemo, useState } from "react";
import { AppsShell } from "@/components/AppsShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useSession } from "@/lib/session";
import { fetchJson, loadAppData } from "@/lib/client-data";
import { isStaticDemo, withBasePath } from "@/lib/paths";
import type { Job, TimeEntry } from "@/lib/types";

export default function PortalPage() {
  const { user } = useSession();
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
    load();
  }, []);

  const openEntry = useMemo(
    () =>
      entries.find((e) => e.employeeId === user?.id && e.clockOut === null) ||
      null,
    [entries, user?.id],
  );

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
        const res = await fetch(withBasePath("/api/time-entries"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            employeeId: user.id,
            jobId: jobId || null,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed");
        setMessage(
          action === "clock_in"
            ? `Clocked in at ${new Date(json.entry.clockIn).toLocaleTimeString()}`
            : `Clocked out at ${new Date(json.entry.clockOut).toLocaleTimeString()}`,
        );
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
              <p className="clock-since">
                Since {new Date(openEntry.clockIn).toLocaleTimeString()}
              </p>
            ) : null}
          </div>

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
