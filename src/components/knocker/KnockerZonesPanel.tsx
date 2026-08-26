"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  clientNewId,
  clientNowIso,
  mutateAppData,
} from "@/lib/client-data";
import type { Employee, KnockEvent, KnockZone } from "@/lib/types";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export function KnockerZonesPanel({
  zones,
  knocks,
  employees,
  onChanged,
}: {
  zones: KnockZone[];
  knocks: KnockEvent[];
  employees: Employee[];
  onChanged: () => Promise<void> | void;
}) {
  const { can } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const knockers = useMemo(
    () =>
      employees.filter(
        (e) =>
          e.active &&
          (e.role === "knocker" ||
            e.role === "sales" ||
            e.role === "admin" ||
            e.role === "manager"),
      ),
    [employees],
  );

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!can("manage_zones")) {
      setMessage("You do not have permission to manage zones.");
      return;
    }
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const assigned = form.getAll("assignees").map(String);
    setBusy(true);
    try {
      await mutateAppData((data) => {
        data.zones.unshift({
          id: clientNewId(),
          name: String(form.get("name") || ""),
          neighborhood: String(form.get("neighborhood") || ""),
          city: String(form.get("city") || ""),
          description: String(form.get("description") || ""),
          targetDoors: Number(form.get("targetDoors") || 50),
          assignedKnockerIds: assigned,
          status: "open",
          centerLat: 36.974,
          centerLng: -122.03,
          createdAt: clientNowIso(),
        });
      });
      formEl.reset();
      setMessage("Zone created — appears in the zone picker above.");
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function updateZone(
    id: string,
    patch: Partial<KnockZone> & { assignedKnockerIds?: string[] },
  ) {
    if (!can("manage_zones")) return;
    await mutateAppData((data) => {
      const z = data.zones.find((x) => x.id === id);
      if (!z) return;
      Object.assign(z, patch);
    });
    await onChanged();
  }

  return (
    <div className="knocker-zones-panel">
      <div className="knocker-zones-stats">
        <div>
          <strong>{zones.length}</strong>
          <span>Zones</span>
        </div>
        <div>
          <strong>{knocks.length}</strong>
          <span>Total knocks</span>
        </div>
        <div>
          <strong>{zones.filter((z) => z.status === "active").length}</strong>
          <span>Active</span>
        </div>
      </div>

      <p className="knocker-hint">
        Zones are neighborhoods assigned to knockers. Draw map turfs on the Map tab —
        turfs sit inside zones and bind door pins.
      </p>

      {can("manage_zones") ? (
        <form onSubmit={onCreate} className="knocker-zones-form">
          <h3>Create zone</h3>
          <input name="name" required placeholder="Zone name" className="field-input" />
          <input
            name="neighborhood"
            required
            placeholder="Neighborhood"
            className="field-input"
          />
          <input name="city" required placeholder="City" className="field-input" />
          <input
            name="targetDoors"
            type="number"
            min={1}
            defaultValue={50}
            placeholder="Target doors"
            className="field-input"
          />
          <input
            name="description"
            placeholder="Description"
            className="field-input knocker-zones-span"
          />
          <fieldset className="knocker-zones-span">
            <legend>Assign knockers</legend>
            <div className="knocker-zones-assignees">
              {knockers.map((k) => (
                <label key={k.id}>
                  <input type="checkbox" name="assignees" value={k.id} />
                  {k.name}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="mainframe-panel-btn" disabled={busy}>
            Create zone
          </button>
        </form>
      ) : (
        <p className="knocker-hint">View-only — ask a manager to assign zones.</p>
      )}

      {message ? <p className="knocker-msg">{message}</p> : null}

      <div className="knocker-zones-grid">
        {zones.map((zone) => {
          const count = knocks.filter((k) => k.zoneId === zone.id).length;
          const pct = zone.targetDoors
            ? Math.min(100, Math.round((count / zone.targetDoors) * 100))
            : 0;
          const recent = knocks.filter((k) => k.zoneId === zone.id).slice(0, 4);
          return (
            <article key={zone.id} className="knocker-zone-card">
              <header>
                <div>
                  <h3>{zone.name}</h3>
                  <p>
                    {zone.neighborhood}, {zone.city}
                  </p>
                </div>
                <span className={cn("knocker-zone-status", `status-${zone.status}`)}>
                  {zone.status}
                </span>
              </header>
              {zone.description ? <p className="knocker-zone-desc">{zone.description}</p> : null}
              <div className="knocker-zone-progress">
                <div>
                  <span>
                    {count} / {zone.targetDoors} doors
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="knocker-zone-bar">
                  <i style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="knocker-zone-controls">
                <select
                  className="field-input"
                  value={zone.status}
                  disabled={!can("manage_zones")}
                  onChange={(e) =>
                    updateZone(zone.id, {
                      status: e.target.value as KnockZone["status"],
                    })
                  }
                >
                  {["open", "active", "paused", "completed"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  multiple
                  className="field-input"
                  disabled={!can("manage_zones")}
                  value={zone.assignedKnockerIds}
                  onChange={(e) => {
                    const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
                    updateZone(zone.id, { assignedKnockerIds: ids });
                  }}
                >
                  {knockers.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>
              <ul>
                {recent.map((k) => (
                  <li key={k.id}>
                    <strong>{k.address}</strong>
                    <span>{k.outcome.replace(/_/g, " ")}</span>
                  </li>
                ))}
                {!recent.length ? <li className="muted">No knocks yet</li> : null}
              </ul>
            </article>
          );
        })}
      </div>
    </div>
  );
}
