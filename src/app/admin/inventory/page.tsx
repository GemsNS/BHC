"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { StatCard } from "@/components/StatCard";
import {
  clientNewId,
  clientNowIso,
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { InventoryItem, InventoryTxn, Job } from "@/lib/types";
import { useSession } from "@/lib/session";
import { formatCurrency } from "@/lib/utils";

export default function InventoryAdminPage() {
  const { user } = useSession();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [txns, setTxns] = useState<InventoryTxn[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  async function refresh() {
    if (isStaticDemo()) {
      const d = await loadAppData();
      setItems(d.inventory);
      setTxns(d.inventoryTxns);
      setJobs(d.jobs);
      return;
    }
    try {
      const json = await fetchJson<{
        inventory: InventoryItem[];
        txns: InventoryTxn[];
        jobs: Job[];
      }>("/api/inventory");
      setItems(json.inventory);
      setTxns(json.txns);
      setJobs(json.jobs);
    } catch {
      const d = await loadAppData();
      setItems(d.inventory);
      setTxns(d.inventoryTxns);
      setJobs(d.jobs);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const low = items.filter((i) => i.quantityOnHand <= i.reorderLevel).length;
  const value = items.reduce((s, i) => s + i.quantityOnHand * i.unitCost, 0);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      sku: String(form.get("sku") || ""),
      name: String(form.get("name") || ""),
      category: String(form.get("category") || "General"),
      unit: String(form.get("unit") || "ea"),
      quantityOnHand: Number(form.get("qty") || 0),
      reorderLevel: Number(form.get("reorder") || 0),
      unitCost: Number(form.get("unitCost") || 0),
      location: String(form.get("location") || "Yard"),
    };
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        d.inventory.push({ id: clientNewId(), ...payload });
      });
    } else {
      await fetchJson("/api/inventory", {
        method: "POST",
        body: JSON.stringify({ action: "create_item", ...payload }),
      });
    }
    formEl.reset();
    await refresh();
  }

  async function onTxn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      itemId: String(form.get("itemId") || ""),
      type: String(form.get("type") || "issue") as InventoryTxn["type"],
      quantity: Number(form.get("quantity") || 0),
      jobId: String(form.get("jobId") || "") || null,
      employeeId: user.id,
      notes: String(form.get("notes") || ""),
      logJobMaterial: form.get("logJobMaterial") === "on",
    };
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        const item = d.inventory.find((i) => i.id === payload.itemId);
        if (!item) return;
        if (payload.type === "receive" || payload.type === "return") {
          item.quantityOnHand += payload.quantity;
        } else if (payload.type === "issue") {
          if (item.quantityOnHand < payload.quantity) return;
          item.quantityOnHand -= payload.quantity;
        } else {
          item.quantityOnHand = payload.quantity;
        }
        d.inventoryTxns.unshift({
          id: clientNewId(),
          itemId: item.id,
          type: payload.type,
          quantity: payload.quantity,
          jobId: payload.jobId,
          employeeId: payload.employeeId,
          notes: payload.notes,
          createdAt: clientNowIso(),
        });
        if (payload.logJobMaterial && payload.type === "issue" && payload.jobId) {
          d.materials.unshift({
            id: clientNewId(),
            jobId: payload.jobId,
            description: item.name,
            vendor: "Inventory",
            quantity: payload.quantity,
            unitCost: item.unitCost,
            purchasedAt: clientNowIso().slice(0, 10),
            notes: payload.notes || "Issued from inventory",
          });
        }
      });
    } else {
      await fetchJson("/api/inventory", {
        method: "POST",
        body: JSON.stringify({ action: "txn", ...payload }),
      });
    }
    formEl.reset();
    await refresh();
  }

  return (
    <RequireAuth perm="inventory">
      <div>
        <PageHeader
          title="Inventory"
          subtitle="Stock on hand, reorder levels, and issue/receive against jobs."
        />
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatCard label="SKUs" value={items.length} />
          <StatCard label="Low stock" value={low} />
          <StatCard label="Stock value" value={formatCurrency(value)} />
        </div>

        <form onSubmit={onCreate} className="form-grid">
          <h2>Add SKU</h2>
          <input name="sku" required placeholder="SKU" className="field-input" />
          <input name="name" required placeholder="Name" className="field-input" />
          <input name="category" placeholder="Category" className="field-input" />
          <input name="unit" placeholder="Unit" className="field-input" />
          <input name="qty" type="number" required placeholder="Qty on hand" className="field-input" />
          <input name="reorder" type="number" placeholder="Reorder level" className="field-input" />
          <input name="unitCost" type="number" step="0.01" placeholder="Unit cost" className="field-input" />
          <input name="location" placeholder="Location" className="field-input" />
          <button type="submit" className="btn-primary">
            Add item
          </button>
        </form>

        <form onSubmit={onTxn} className="form-grid">
          <h2>Stock transaction</h2>
          <select name="itemId" required className="field-input" defaultValue="">
            <option value="" disabled>
              Item
            </option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.sku} — {i.name} ({i.quantityOnHand})
              </option>
            ))}
          </select>
          <select name="type" className="field-input" defaultValue="issue">
            <option value="issue">Issue</option>
            <option value="receive">Receive</option>
            <option value="return">Return</option>
            <option value="adjust">Adjust (set qty)</option>
          </select>
          <input name="quantity" type="number" min={0.01} step="0.01" required placeholder="Qty" className="field-input" />
          <select name="jobId" className="field-input" defaultValue="">
            <option value="">No job</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
          <input name="notes" placeholder="Notes" className="field-input" />
          <label className="board-pin">
            <input type="checkbox" name="logJobMaterial" defaultChecked />
            Also log as job material cost on issue
          </label>
          <button type="submit" className="btn-primary">
            Post txn
          </button>
        </form>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>On hand</th>
                <th>Reorder</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{i.name}</strong>
                    <div className="muted">
                      {i.sku} · {i.location}
                    </div>
                  </td>
                  <td>
                    {i.quantityOnHand} {i.unit}
                    {i.quantityOnHand <= i.reorderLevel ? (
                      <span className="cc-alert-chip warn ml-2">Low</span>
                    ) : null}
                  </td>
                  <td>{i.reorderLevel}</td>
                  <td>{formatCurrency(i.quantityOnHand * i.unitCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">Recent txns: {txns.slice(0, 5).length} shown in store</p>
      </div>
    </RequireAuth>
  );
}
