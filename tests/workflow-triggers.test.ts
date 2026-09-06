import { describe, expect, it } from "vitest";
import { buildDemoSeedData } from "../src/lib/demo-seed";
import { normalizeStore } from "../src/lib/normalize";
import {
  onDamageReported,
  onJobStatusChanged,
  onLeadStatusChanged,
  onProposalSigned,
  runScheduledWorkflows,
  workflowMatches,
} from "../src/lib/workflows";
import type { AppData, WorkflowDefinition } from "../src/lib/types";

function data(): AppData {
  return normalizeStore(buildDemoSeedData());
}

function enable(d: AppData, id: string): WorkflowDefinition {
  const wf = d.workflows.find((w) => w.id === id)!;
  wf.enabled = true;
  return wf;
}

describe("new workflow triggers", () => {
  it("lead won → create job (template) creates one job and notifies", () => {
    const d = data();
    enable(d, "wf-lead-won-job");
    const lead = d.leads[0];
    d.jobs = d.jobs.filter((j) => j.leadId !== lead.id);
    lead.status = "won";
    const jobsBefore = d.jobs.length;
    const runs = onLeadStatusChanged(d, lead);
    expect(runs.some((r) => r.workflowId === "wf-lead-won-job" && r.status === "completed")).toBe(true);
    expect(d.jobs.length).toBe(jobsBefore + 1);
    expect(d.jobs[0].leadId).toBe(lead.id);
    expect(d.notifications[0].title).toBe("New job from won lead");
    // Re-running does not duplicate the job
    onLeadStatusChanged(d, lead);
    expect(d.jobs.filter((j) => j.leadId === lead.id)).toHaveLength(1);
  });

  it("status filter blocks non-matching statuses", () => {
    const d = data();
    const wf = enable(d, "wf-lead-won-job");
    expect(workflowMatches(wf, "lead_status_changed", { leadStatus: "won" })).toBe(true);
    expect(workflowMatches(wf, "lead_status_changed", { leadStatus: "lost" })).toBe(false);
    expect(workflowMatches(wf, "lead_created", {})).toBe(false);
  });

  it("job completed → draft invoice once", () => {
    const d = data();
    enable(d, "wf-job-completed-invoice");
    const job = d.jobs[0];
    d.invoices = d.invoices.filter((i) => i.jobId !== job.id);
    job.status = "completed";
    onJobStatusChanged(d, job);
    const drafts = d.invoices.filter((i) => i.jobId === job.id && i.kind === "invoice");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].status).toBe("draft");
    expect(drafts[0].lines[0].unitPrice).toBe(job.contractValue || job.estimatedValue);
    onJobStatusChanged(d, job);
    expect(d.invoices.filter((i) => i.jobId === job.id && i.kind === "invoice")).toHaveLength(1);
  });

  it("critical damage → notification + queued webhook", () => {
    const d = data();
    enable(d, "wf-damage-critical");
    d.webhookEndpoints = [
      {
        id: "ep",
        name: "ops",
        url: "https://example.test/hook",
        secret: "x",
        events: ["damage.reported"],
        enabled: true,
        createdAt: new Date().toISOString(),
      },
    ];
    d.webhookDeliveries = [];
    const report = {
      id: "dmg-1",
      targetType: "vehicle" as const,
      targetId: null,
      targetLabel: "Crew truck #1",
      jobId: null,
      reportedById: "emp-admin",
      severity: "critical" as const,
      description: "Cracked windshield",
      imageDataUrls: [],
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    d.damageReports.unshift(report);
    const runs = onDamageReported(d, report);
    expect(runs).toHaveLength(1);
    expect(d.notifications[0].title).toBe("Critical damage reported");
    expect(d.webhookDeliveries).toHaveLength(1);
    expect(d.webhookDeliveries[0].status).toBe("pending");
    expect(d.webhookDeliveries[0].event).toBe("damage.reported");

    // low severity does not match
    const low = { ...report, id: "dmg-2", severity: "low" as const };
    expect(onDamageReported(d, low)).toHaveLength(0);
  });

  it("proposal signed → scheduling task", () => {
    const d = data();
    enable(d, "wf-proposal-signed");
    const proposal = d.knockProposals[0];
    if (!proposal) return; // seed without proposals
    const before = d.activities.length;
    onProposalSigned(d, proposal);
    expect(d.activities.length).toBe(before + 1);
    expect(d.activities[0].subject).toContain("Schedule signed proposal");
  });

  it("scheduled workflows run at most once per day after their hour", () => {
    const d = data();
    d.workflows.unshift({
      id: "wf-sched",
      name: "Morning nudge",
      description: "",
      enabled: true,
      trigger: "scheduled",
      triggerConfig: { hour: "6" },
      actions: [{ type: "create_notification", config: { title: "Morning nudge" } }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const at = new Date();
    at.setHours(7, 0, 0, 0);
    expect(runScheduledWorkflows(d, at)).toHaveLength(1);
    expect(runScheduledWorkflows(d, at)).toHaveLength(0);
    const early = new Date(at);
    early.setHours(5);
    d.workflowRuns = [];
    expect(runScheduledWorkflows(d, early)).toHaveLength(0);
  });
});
