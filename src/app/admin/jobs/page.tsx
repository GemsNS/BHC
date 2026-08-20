"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import type { Employee, Job, JobStatus } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/jobs");
    const json = await res.json();
    setJobs(json.jobs);
    setEmployees(json.employees);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: String(form.get("title") || ""),
        customerName: String(form.get("customerName") || ""),
        address: String(form.get("address") || ""),
        jobType: String(form.get("jobType") || "residential"),
        startDate: String(form.get("startDate") || ""),
        estimatedValue: Number(form.get("estimatedValue") || 0),
        crewLeadId: String(form.get("crewLeadId") || "") || null,
        notes: String(form.get("notes") || ""),
      }),
    });
    e.currentTarget.reset();
    await load();
  }

  async function updateStatus(id: string, status: JobStatus) {
    await fetch("/api/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle="Schedule and track residential and commercial field work."
      />

      <form
        onSubmit={onCreate}
        className="mb-8 grid gap-3 rounded-xl border border-[var(--line)] bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        <h2 className="font-[family-name:var(--font-display)] text-2xl sm:col-span-2 lg:col-span-3">
          Schedule job
        </h2>
        <input name="title" required placeholder="Job title" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="customerName" required placeholder="Customer" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="address" required placeholder="Job site address" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <select name="jobType" defaultValue="residential" className="rounded-md border border-[var(--line)] px-3 py-2">
          <option value="residential">Residential</option>
          <option value="commercial">Commercial</option>
        </select>
        <input name="startDate" required type="date" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <input name="estimatedValue" required type="number" min={0} placeholder="Estimated value" className="rounded-md border border-[var(--line)] px-3 py-2" />
        <select name="crewLeadId" defaultValue="" className="rounded-md border border-[var(--line)] px-3 py-2">
          <option value="">Crew lead</option>
          {employees
            .filter((e) => e.role === "field" || e.role === "admin")
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
        <input name="notes" placeholder="Notes" className="rounded-md border border-[var(--line)] px-3 py-2 sm:col-span-2" />
        <button type="submit" className="rounded-md bg-[var(--amber)] px-4 py-2 font-semibold text-[var(--ink)]">
          Create job
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--line)] bg-[var(--foam)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Start</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Update</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-[var(--muted)]">
                  Loading…
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{job.title}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {job.customerName} · {job.address}
                    </p>
                  </td>
                  <td className="px-4 py-3">{formatCurrency(job.estimatedValue)}</td>
                  <td className="px-4 py-3">{job.startDate}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-md border border-[var(--line)] px-2 py-1"
                      value={job.status}
                      onChange={(e) =>
                        updateStatus(job.id, e.target.value as JobStatus)
                      }
                    >
                      {["scheduled", "in_progress", "on_hold", "completed", "invoiced"].map(
                        (s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
