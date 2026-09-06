import { NextResponse } from "next/server";
import { z } from "zod";
import {
  processSequenceSteps,
  runSingleWorkflow,
} from "@/lib/workflows";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import {
  WORKFLOW_ACTION_TYPES,
  WORKFLOW_TRIGGERS,
  type WorkflowActionType,
  type WorkflowDefinition,
  type WorkflowTrigger,
} from "@/lib/types";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    workflows: data.workflows,
    workflowRuns: data.workflowRuns.slice(0, 50),
    sequences: data.sequences,
    sequenceEnrollments: data.sequenceEnrollments,
  });
}

const workflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  trigger: z.enum(WORKFLOW_TRIGGERS as [WorkflowTrigger, ...WorkflowTrigger[]]),
  triggerConfig: z.record(z.string(), z.string()).optional(),
  actions: z.array(
    z.object({
      type: z.enum(WORKFLOW_ACTION_TYPES as [WorkflowActionType, ...WorkflowActionType[]]),
      config: z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
      ),
    }),
  ),
});

export async function POST(request: Request) {
  const body = await request.json();

  if (body.action === "run_manual") {
    const workflowId = z.string().parse(body.workflowId);
    const context = z
      .object({
        leadId: z.string().optional(),
        shiftId: z.string().optional(),
        authorId: z.string().optional(),
      })
      .parse(body.context ?? {});

    let runs: Awaited<ReturnType<typeof runSingleWorkflow>> = [];
    await updateStore((data) => {
      const lead = context.leadId
        ? data.leads.find((l) => l.id === context.leadId)
        : undefined;
      runs = runSingleWorkflow(data, workflowId, {
        ...context,
        leadStatus: lead?.status,
      });
    });

    return NextResponse.json({ runs });
  }

  if (body.action === "process_sequences") {
    let count = 0;
    await updateStore((data) => {
      count = processSequenceSteps(data);
    });
    return NextResponse.json({ processed: count });
  }

  if (body.action === "toggle") {
    const id = z.string().parse(body.id);
    let updated: WorkflowDefinition | null = null;
    await updateStore((data) => {
      const wf = data.workflows.find((w) => w.id === id);
      if (!wf) return;
      wf.enabled = !wf.enabled;
      wf.updatedAt = nowIso();
      updated = wf;
    });
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ workflow: updated });
  }

  const parsed = workflowSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const stamp = nowIso();
  const workflow: WorkflowDefinition = {
    id: newId(),
    name: parsed.data.name,
    description: parsed.data.description ?? "",
    enabled: parsed.data.enabled ?? true,
    trigger: parsed.data.trigger,
    triggerConfig: parsed.data.triggerConfig ?? {},
    actions: parsed.data.actions,
    createdAt: stamp,
    updatedAt: stamp,
  };

  await updateStore((data) => {
    data.workflows.unshift(workflow);
  });

  return NextResponse.json({ workflow }, { status: 201 });
}
