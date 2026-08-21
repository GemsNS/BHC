"use client";

import Link from "next/link";
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

const OUTCOMES: CanvassOutcome[] = [
  "not_home",
  "interested",
  "appointment",
  "not_interested",
  "do_not_knock",
];

export default function KnockerAppPage() {
  const { user, can, loading: sessionLoading } = useSession();
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

  if (!can("knocker")) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--ink)] px-6 text-center text-white">
        <p>Your role cannot use the Knocker app.</p>
        <Link href="/apps" className="text-[var(--amber)]">
          Back to apps
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--ink)] text-[var(--foam)]">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-6">
        <header className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">
              Field app
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-4xl tracking-wide text-[var(--amber)]">
              KNOCKER
            </h1>
            <p className="mt-1 text-sm text-white/60">{user?.name}</p>
          </div>
          <Link href="/apps" className="text-sm text-white/50 hover:text-[var(--amber)]">
            Apps
          </Link>
        </header>

        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-wide text-white/45">Today</p>
            <p className="font-[family-name:var(--font-display)] text-2xl">
              {myToday.length}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-wide text-white/45">Zone</p>
            <p className="font-[family-name:var(--font-display)] text-2xl">
              {zoneKnocks.length}
              <span className="text-sm text-white/40">
                /{activeZone?.targetDoors ?? "—"}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] uppercase tracking-wide text-white/45">GPS</p>
            <p className="font-[family-name:var(--font-display)] text-lg">
              {coords ? "ON" : "OFF"}
            </p>
          </div>
        </div>

        <label className="text-xs uppercase tracking-[0.14em] text-white/45">
          Assigned zone
        </label>
        <select
          className="mt-2 w-full rounded-md border border-white/15 bg-black/40 px-3 py-3"
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
        {activeZone ? (
          <p className="mt-2 text-sm text-white/55">{activeZone.description}</p>
        ) : null}

        <form
          onSubmit={onSubmit}
          className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4"
        >
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            Log this door
          </h2>
          <input
            name="address"
            required
            placeholder="Street address"
            className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-3"
          />
          <select
            name="outcome"
            defaultValue="interested"
            className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-3"
          >
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <input
            name="notes"
            placeholder="Notes"
            className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-3"
          />
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input name="createLead" type="checkbox" defaultChecked />
            Create CRM lead if interested / appointment
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              name="leadName"
              placeholder="Lead name"
              className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm"
            />
            <input
              name="leadPhone"
              placeholder="Lead phone"
              className="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !zoneId}
            className="w-full rounded-md bg-[var(--amber)] py-4 text-lg font-semibold text-[var(--ink)] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save knock"}
          </button>
          {message ? (
            <p className="text-center text-sm text-emerald-300">{message}</p>
          ) : null}
        </form>

        <section className="mt-6 flex-1">
          <h3 className="font-[family-name:var(--font-display)] text-xl">
            Recent in zone
          </h3>
          <ul className="mt-3 space-y-2">
            {zoneKnocks.slice(0, 12).map((k) => (
              <li
                key={k.id}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{k.address}</span>
                  <StatusBadge status={k.outcome} />
                </div>
                <p className="mt-1 text-xs text-white/45">
                  {new Date(k.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
            {zoneKnocks.length === 0 ? (
              <li className="text-sm text-white/45">No knocks in this zone yet.</li>
            ) : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
