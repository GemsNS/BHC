import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, readStore, updateStore } from "@/lib/store";
import type { MaterialCost } from "@/lib/types";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    materials: data.materials,
    jobs: data.jobs,
  });
}

export async function POST(request: Request) {
  const schema = z.object({
    jobId: z.string(),
    description: z.string().min(1),
    vendor: z.string().optional(),
    quantity: z.number().positive(),
    unitCost: z.number().nonnegative(),
    purchasedAt: z.string().min(1),
    notes: z.string().optional(),
  });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const item: MaterialCost = {
    id: newId(),
    jobId: parsed.data.jobId,
    description: parsed.data.description,
    vendor: parsed.data.vendor ?? "",
    quantity: parsed.data.quantity,
    unitCost: parsed.data.unitCost,
    purchasedAt: parsed.data.purchasedAt,
    notes: parsed.data.notes ?? "",
  };
  await updateStore((d) => {
    d.materials.unshift(item);
  });
  return NextResponse.json({ material: item }, { status: 201 });
}
