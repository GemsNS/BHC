import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import type { ToolAsset, ToolCheckout } from "@/lib/types";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    tools: data.tools,
    checkouts: data.toolCheckouts,
    employees: data.employees,
    jobs: data.jobs,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const action = String(body.action || "create");

  if (action === "create") {
    const schema = z.object({
      name: z.string().min(1),
      category: z.string().optional(),
      assetTag: z.string().min(1),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const tool: ToolAsset = {
      id: newId(),
      name: parsed.data.name,
      category: parsed.data.category || "General",
      assetTag: parsed.data.assetTag,
      status: "available",
      checkedOutToId: null,
      checkedOutAt: null,
      jobId: null,
      notes: parsed.data.notes || "",
    };
    await updateStore((d) => {
      d.tools.push(tool);
    });
    return NextResponse.json({ tool }, { status: 201 });
  }

  if (action === "checkout") {
    const schema = z.object({
      toolId: z.string(),
      employeeId: z.string(),
      jobId: z.string().nullable().optional(),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid checkout" }, { status: 400 });
    }
    let checkout: ToolCheckout | null = null;
    await updateStore((d) => {
      const tool = d.tools.find((t) => t.id === parsed.data.toolId);
      if (!tool || tool.status !== "available") return;
      const stamp = nowIso();
      tool.status = "checked_out";
      tool.checkedOutToId = parsed.data.employeeId;
      tool.checkedOutAt = stamp;
      tool.jobId = parsed.data.jobId || null;
      checkout = {
        id: newId(),
        toolId: tool.id,
        employeeId: parsed.data.employeeId,
        jobId: parsed.data.jobId || null,
        checkedOutAt: stamp,
        checkedInAt: null,
        notes: parsed.data.notes || "",
      };
      d.toolCheckouts.unshift(checkout);
    });
    if (!checkout) {
      return NextResponse.json({ error: "Tool not available" }, { status: 409 });
    }
    return NextResponse.json({ checkout });
  }

  if (action === "checkin") {
    const toolId = z.string().parse(body.toolId);
    await updateStore((d) => {
      const tool = d.tools.find((t) => t.id === toolId);
      if (!tool) return;
      tool.status = "available";
      tool.checkedOutToId = null;
      tool.checkedOutAt = null;
      tool.jobId = null;
      const open = d.toolCheckouts.find(
        (c) => c.toolId === toolId && !c.checkedInAt,
      );
      if (open) open.checkedInAt = nowIso();
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
