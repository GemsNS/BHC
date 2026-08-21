"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/session";
import {
  clientNewId,
  clientNowIso,
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { CanvassOutcome, KnockEvent, KnockZone, Lead } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { AppsShell } from "@/components/AppsShell";
import { RequireAuth } from "@/components/RequireAuth";

const OUTCOMES: CanvassOutcome[] = [
  "not_home",
  "interested",
  "appointment",
  "not_interested",
  "do_not_knock",
];

export default function KnockerAppPage() {
  const { user, loading: sessionLoading } = useSession();
  const [zones, setZones] = useState<KnockZone[]>([]);
  const [knocks, setKnocks] = useState<KnockEvent[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const refresh = useCallback(async () => {
    if (isStaticDemo()) {
      const data = await loadAppData();
      setZones(data.zones);
      setKnocks(data.knocks);
      return;
    }
    try {
      const json = await fetchJson<{
        zones: KnockZone[];
        knocks: KnockEvent[];
      }>("/api/zones");
      setZones(json.zones);
      setKnocks(json.knocks);
    } catch {
      const data = await loadAppData();
      setZones(data.zones);
      setKnocks(data.knocks);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCoords(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

  const myZones = useMemo(() => {
    if (!user) return [];
    if (user.role === "admin" || user.role === "manager") return zones;
    return zones.filter((z) => z.assignedKnockerIds.includes(user.id));
  }, [zones, user]);

  useEffect(() => {
    if (!zoneId && myZones[0]) setZoneId(myZones[0].id);
  }, [myZones, zoneId]);

  const activeZone = myZones.find((z) => z.id === zoneId);
  const zoneKnocks = knocks.filter((k) => k.zoneId === zoneId);
  const myToday = knocks.filter(
    (k) =>
      k.knockerId === user?.id &&
      new Date(k.createdAt).toDateString() === new Date().toDateString(),
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !zoneId) return;
    setBusy(true);
    setMessage(null);
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const payload = {
      zoneId,
      knockerId: user.id,
      address: String(form.get("address") || ""),
      outcome: String(form.get("outcome") || "not_home") as CanvassOutcome,
      notes: String(form.get("notes") || ""),
      createLead: form.get("createLead") === "on",
      leadName: String(form.get("leadName") || ""),
      leadPhone: String(form.get("leadPhone") || ""),
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    };

    try {
      if (isStaticDemo()) {
        await mutateAppData((data) => {
          const stamp = clientNowIso();
          const zone = data.zones.find((z) => z.id === payload.zoneId);
          let lead: Lead | null = null;
          if (
            payload.createLead &&
            (payload.outcome === "interested" ||
              payload.outcome === "appointment")
          ) {
            lead = {
              id: clientNewId(),
              name: payload.leadName || `Knock lead @ ${payload.address}`,
              phone: payload.leadPhone || "",
              email: "",
              address: payload.address,
              city: zone?.city || "",
              source: "Door-to-door",
              status:
                payload.outcome === "appointment" ? "qualified" : "new",
              jobType: "residential",
              notes: payload.notes,
              assignedToId: payload.knockerId,
              createdAt: stamp,
              updatedAt: stamp,
            };
            data.leads.unshift(lead);
          }
          data.knocks.unshift({
            id: clientNewId(),
            zoneId: payload.zoneId,
            knockerId: payload.knockerId,
            address: payload.address,
            outcome: payload.outcome,
            notes: payload.notes,
            leadId: lead?.id ?? null,
            lat: payload.lat,
            lng: payload.lng,
            createdAt: stamp,
          });
        });
        setMessage("Knock logged (demo store).");
      } else {
        const json = await fetchJson<{ knock: KnockEvent; lead: Lead | null }>(
          "/api/knocks",
          { method: "POST", body: JSON.stringify(payload) },
        );
        setMessage(
          json.lead
            ? `Knock + lead created: ${json.lead.name}`
            : "Knock logged.",
        );
      }
      formEl.reset();
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to log knock");
    } finally {
      setBusy(false);
    }
  }

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--ink)] text-white">
        Loading…
      </div>
    );
  }

  return (
    <AppsShell title="Knocker">
      <RequireAuth perm="knocker">
      <div className="knocker-app">
        <div className="knocker-stats">
          <div className="knocker-stat">
            <p>Today</p>
            <strong>{myToday.length}</strong>
          </div>
          <div className="knocker-stat">
            <p>Zone</p>
            <strong>
              {zoneKnocks.length}
              <span>/{activeZone?.targetDoors ?? "—"}</span>
            </strong>
          </div>
          <div className="knocker-stat">
            <p>GPS</p>
            <strong>{coords ? "ON" : "OFF"}</strong>
          </div>
        </div>

        <label className="field">
          <span>Assigned zone</span>
          <select
            className="field-input"
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value)}
          >
            {myZones.length === 0 ? (
              <option value="">No zones assigned</option>
            ) : (
              myZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} · {z.neighborhood} ({z.status})
                </option>
              ))
            )}
          </select>
        </label>
        {activeZone ? (
          <p className="knocker-zone-desc">{activeZone.description}</p>
        ) : null}

        <form onSubmit={onSubmit} className="knocker-form">
          <h2>Log this door</h2>
          <input
            name="address"
            required
            placeholder="Street address"
            className="field-input"
          />
          <select name="outcome" defaultValue="interested" className="field-input">
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <input name="notes" placeholder="Notes" className="field-input" />
          <label className="board-pin">
            <input name="createLead" type="checkbox" defaultChecked />
            Create CRM lead if interested / appointment
          </label>
          <div className="knocker-lead-row">
            <input name="leadName" placeholder="Lead name" className="field-input" />
            <input name="leadPhone" placeholder="Lead phone" className="field-input" />
          </div>
          <button
            type="submit"
            disabled={busy || !zoneId}
            className="btn-primary btn-block"
          >
            {busy ? "Saving…" : "Save knock"}
          </button>
          {message ? <p className="knocker-msg">{message}</p> : null}
        </form>

        <section className="knocker-recent">
          <h3>Recent in zone</h3>
          <ul>
            {zoneKnocks.slice(0, 12).map((k) => (
              <li key={k.id}>
                <div>
                  <span className="font-medium">{k.address}</span>
                  <StatusBadge status={k.outcome} />
                </div>
                <p>{new Date(k.createdAt).toLocaleString()}</p>
              </li>
            ))}
            {zoneKnocks.length === 0 ? (
              <li className="empty">No knocks in this zone yet.</li>
            ) : null}
          </ul>
        </section>
      </div>
      </RequireAuth>
    </AppsShell>
  );
}
