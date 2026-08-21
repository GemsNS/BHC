import { NextResponse } from "next/server";
import { z } from "zod";
import { newId, nowIso, readStore, updateStore } from "@/lib/store";
import type { InventoryItem, InventoryTxn, MaterialCost } from "@/lib/types";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({
    inventory: data.inventory,
    txns: data.inventoryTxns,
    jobs: data.jobs,
    employees: data.employees,
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const action = String(body.action || "create_item");

  if (action === "create_item") {
    const schema = z.object({
      sku: z.string().min(1),
      name: z.string().min(1),
      category: z.string().optional(),
      unit: z.string().optional(),
      quantityOnHand: z.number(),
      reorderLevel: z.number().optional(),
      unitCost: z.number().optional(),
      location: z.string().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const item: InventoryItem = {
      id: newId(),
      sku: parsed.data.sku,
      name: parsed.data.name,
      category: parsed.data.category || "General",
      unit: parsed.data.unit || "ea",
      quantityOnHand: parsed.data.quantityOnHand,
      reorderLevel: parsed.data.reorderLevel ?? 0,
      unitCost: parsed.data.unitCost ?? 0,
      location: parsed.data.location || "Yard",
    };
    await updateStore((d) => {
      d.inventory.push(item);
    });
    return NextResponse.json({ item }, { status: 201 });
  }

  if (action === "txn") {
    const schema = z.object({
      itemId: z.string(),
      type: z.enum(["receive", "issue", "adjust", "return"]),
      quantity: z.number().positive(),
      jobId: z.string().nullable().optional(),
      employeeId: z.string(),
      notes: z.string().optional(),
      logJobMaterial: z.boolean().optional(),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    let txn: InventoryTxn | null = null;
    await updateStore((d) => {
      const item = d.inventory.find((i) => i.id === parsed.data.itemId);
      if (!item) return;
      const qty = parsed.data.quantity;
      if (parsed.data.type === "receive" || parsed.data.type === "return") {
        item.quantityOnHand += qty;
      } else if (parsed.data.type === "issue") {
        if (item.quantityOnHand < qty) return;
        item.quantityOnHand -= qty;
      } else {
        item.quantityOnHand = qty;
      }
      txn = {
        id: newId(),
        itemId: item.id,
        type: parsed.data.type,
        quantity: qty,
        jobId: parsed.data.jobId || null,
        employeeId: parsed.data.employeeId,
        notes: parsed.data.notes || "",
        createdAt: nowIso(),
      };
      d.inventoryTxns.unshift(txn);
      if (
        parsed.data.logJobMaterial &&
        parsed.data.type === "issue" &&
        parsed.data.jobId
      ) {
        const mat: MaterialCost = {
          id: newId(),
          jobId: parsed.data.jobId,
          description: item.name,
          vendor: "Inventory",
          quantity: qty,
          unitCost: item.unitCost,
          purchasedAt: nowIso().slice(0, 10),
          notes: parsed.data.notes || "Issued from inventory",
        };
        d.materials.unshift(mat);
      }
    });
    if (!txn) {
      return NextResponse.json({ error: "Txn failed (stock?)" }, { status: 409 });
    }
    return NextResponse.json({ txn });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
