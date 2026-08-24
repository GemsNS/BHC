"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSession } from "@/lib/session";
import {
  createKnockPin,
  createTerritory,
  loadKnockerData,
  pingRepLocation,
  postKnockChat,
  type KnockerPayload,
} from "@/lib/knocker/client";
import { buildKnockerLeaderboard } from "@/lib/knocker/ops";
import { DEFAULT_KNOCK_COLORS } from "@/lib/knocker/colors";
import { navigationUrl, optimizeRoute } from "@/lib/knocker/route";
import type { CanvassOutcome, KnockEvent } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import type { LatLng } from "@/lib/knocker/geo";

const KnockerMap = dynamic(
  () => import("@/components/knocker/KnockerMap").then((m) => m.KnockerMap),
  { ssr: false, loading: () => <div className="knocker-map-canvas knocker-map-loading">Loading map…</div> },
);

const OUTCOMES: CanvassOutcome[] = [
  "not_home",
  "interested",
  "pitched",
  "appointment",
  "sold",
  "callback",
  "not_interested",
  "do_not_knock",
];

type Tab = "map" | "pin" | "route" | "tasks" | "team" | "stats";

export function KnockerCommandCenter({ admin = false }: { admin?: boolean }) {
  const { user, can } = useSession();
  const [data, setData] = useState<KnockerPayload | null>(null);
  const [tab, setTab] = useState<Tab>("map");
  const [zoneId, setZoneId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [draftPoints, setDraftPoints] = useState<LatLng[]>([]);
  const [selectedPin, setSelectedPin] = useState<KnockEvent | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [placePinMode, setPlacePinMode] = useState(false);
  const [pendingPinLoc, setPendingPinLoc] = useState<LatLng | null>(null);

  const refresh = useCallback(async () => {
    const payload = await loadKnockerData();
    setData(payload);
    if (!zoneId && payload.zones[0]) setZoneId(payload.zones[0].id);
  }, [zoneId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let last: LatLng | null = null;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(pt);
        if (user?.id) {
          const moved =
            !last ||
            Math.hypot(pt.lat - last.lat, pt.lng - last.lng) > 0.00025;
          if (moved) {
            last = pt;
            void pingRepLocation(user.id, pt.lat, pt.lng);
          }
        }
      },
      () => setCoords(null),
      { enableHighAccuracy: false, maximumAge: 15000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [user?.id]);

  const myZones = useMemo(() => {
    if (!data || !user) return [];
    if (admin || user.role === "admin" || user.role === "manager") return data.zones;
    return data.zones.filter((z) => z.assignedKnockerIds.includes(user.id));
  }, [data, user, admin]);

  const activeZone = myZones.find((z) => z.id === zoneId) ?? myZones[0];
  const zoneKnocks = useMemo(
    () => (data?.knocks ?? []).filter((k) => k.zoneId === (activeZone?.id ?? zoneId)),
    [data?.knocks, activeZone?.id, zoneId],
  );

  const center = useMemo(
    () =>
      coords ??
      (activeZone
        ? { lat: activeZone.centerLat, lng: activeZone.centerLng }
        : { lat: 36.974, lng: -122.029 }),
    [coords, activeZone],
  );

  const routeOrder = useMemo(() => {
    const stops = zoneKnocks.filter((k) => k.lat != null && k.lng != null) as Array<
      KnockEvent & { lat: number; lng: number }
    >;
    const ordered = optimizeRoute(center, stops.map((s) => ({ lat: s.lat, lng: s.lng })));
    return ordered.map(
      (pt) => stops.find((s) => s.lat === pt.lat && s.lng === pt.lng)?.id ?? "",
    ).filter(Boolean);
  }, [zoneKnocks, center]);

  const leaderboard = useMemo(
    () => (data ? buildKnockerLeaderboard(data) : []),
    [data],
  );

  const colorCodes = data?.knockColorCodes ?? DEFAULT_KNOCK_COLORS;
  const territories = (data?.knockTerritories ?? []).filter(
    (t) => !activeZone || t.zoneId === activeZone.id || t.zoneId == null,
  );

  async function onSavePin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !activeZone) return;
    setBusy(true);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    try {
      const { knock, lead } = await createKnockPin({
        zoneId: activeZone.id,
        knockerId: user.id,
        address:
          String(form.get("address") || "") ||
          (pendingPinLoc
            ? `Pin @ ${pendingPinLoc.lat.toFixed(5)}, ${pendingPinLoc.lng.toFixed(5)}`
            : ""),
        outcome: String(form.get("outcome") || "not_home") as CanvassOutcome,
        notes: String(form.get("notes") || ""),
        homeownerName: String(form.get("homeownerName") || ""),
        phone: String(form.get("phone") || ""),
        email: String(form.get("email") || ""),
        tagIds: form.getAll("tags").map(String),
        lat: pendingPinLoc?.lat ?? coords?.lat ?? null,
        lng: pendingPinLoc?.lng ?? coords?.lng ?? null,
        createLead: form.get("createLead") === "on",
        allowDuplicate: form.get("allowDuplicate") === "on",
      });
      setMessage(lead ? `Pin saved + lead: ${lead.name}` : `Pin saved: ${knock.address}`);
      setPendingPinLoc(null);
      setPlacePinMode(false);
      e.currentTarget.reset();
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save pin");
    } finally {
      setBusy(false);
    }
  }

  async function finishTurf() {
    if (draftPoints.length < 3) {
      setMessage("Draw at least 3 points for a turf boundary.");
      return;
    }
    setBusy(true);
    try {
      const bound = await createTerritory({
        name: `${activeZone?.name ?? "Turf"} ${new Date().toLocaleDateString()}`,
        zoneId: activeZone?.id ?? null,
        points: draftPoints,
        assignedRepIds: user ? [user.id] : [],
      });
      setDraftPoints([]);
      setDrawMode(false);
      setMessage(`Turf saved — ${bound} pin(s) auto-assigned inside boundary.`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sendChat(e: FormEvent) {
    e.preventDefault();
    if (!user || !chatInput.trim()) return;
    await postKnockChat(user.id, chatInput.trim());
    setChatInput("");
    await refresh();
  }

  if (!data) {
    return <div className="knocker-command loading">Loading Active Knocker…</div>;
  }

  return (
    <div className="knocker-command">
      <header className="knocker-command-head">
        <div>
          <p className="knocker-command-eyebrow">ACTIVE KNOCKER · BHC FIELD</p>
          <h1>{admin ? "Territory command" : "Door knocker"}</h1>
        </div>
        <div className="knocker-command-stats">
          <span>GPS {coords ? "LIVE" : "OFF"}</span>
          <span>{zoneKnocks.length} pins</span>
          <span>{territories.length} turfs</span>
        </div>
      </header>

      <div className="knocker-command-toolbar">
        <select
          className="field-input"
          value={activeZone?.id ?? ""}
          onChange={(e) => setZoneId(e.target.value)}
        >
          {myZones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name} · {z.neighborhood}
            </option>
          ))}
        </select>
        <nav className="knocker-tabs">
          {(
            [
              ["map", "Map"],
              ["pin", "Pin"],
              ["route", "Route"],
              ["tasks", "Tasks"],
              ["team", "Team"],
              ["stats", "Stats"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {message ? <p className="knocker-msg banner">{message}</p> : null}

      {tab === "map" ? (
        <div className="knocker-map-panel">
          <div className="knocker-map-tools">
            <button
              type="button"
              className={drawMode ? "active" : ""}
              onClick={() => {
                setDrawMode((d) => !d);
                setDraftPoints([]);
              }}
            >
              {drawMode ? "Drawing turf…" : "Draw turf"}
            </button>
            {drawMode ? (
              <>
                <button type="button" onClick={() => setDraftPoints([])}>
                  Clear
                </button>
                <button type="button" onClick={finishTurf} disabled={busy}>
                  Close polygon
                </button>
              </>
            ) : null}
            <button
              type="button"
              className={placePinMode ? "active" : ""}
              onClick={() => setPlacePinMode((p) => !p)}
            >
              Drop pin
            </button>
          </div>
          <KnockerMap
            center={center}
            pins={zoneKnocks}
            territories={territories}
            repLocations={data.knockRepLocations}
            colorCodes={colorCodes}
            drawMode={drawMode}
            draftPoints={draftPoints}
            onDraftPoint={(pt) => setDraftPoints((pts) => [...pts, pt])}
            onPinSelect={(pin) => {
              setSelectedPin(pin);
              setTab("pin");
            }}
            onMapClick={(pt) => {
              if (placePinMode) {
                setPendingPinLoc(pt);
                setTab("pin");
              }
            }}
            selectedPinId={selectedPin?.id ?? null}
            routeOrder={routeOrder}
          />
          <aside className="knocker-legend">
            {colorCodes.map((c) => (
              <span key={c.id}>
                <i style={{ background: c.hex }} /> {c.label}
              </span>
            ))}
          </aside>
        </div>
      ) : null}

      {tab === "pin" ? (
        <div className="knocker-split">
          <form onSubmit={onSavePin} className="knocker-form">
            <h2>{selectedPin ? "Update context" : "Log door pin"}</h2>
            {pendingPinLoc ? (
              <p className="knocker-hint">
                Map pin @ {pendingPinLoc.lat.toFixed(5)}, {pendingPinLoc.lng.toFixed(5)}
              </p>
            ) : null}
            <input name="address" required placeholder="Street address" className="field-input" defaultValue={selectedPin?.address} />
            <input name="homeownerName" placeholder="Homeowner name" className="field-input" defaultValue={selectedPin?.homeownerName} />
            <input name="phone" placeholder="Phone" className="field-input" defaultValue={selectedPin?.phone} />
            <input name="email" placeholder="Email" className="field-input" defaultValue={selectedPin?.email} />
            <select name="outcome" defaultValue={selectedPin?.outcome ?? "interested"} className="field-input">
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {o.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <fieldset>
              <legend>Tags</legend>
              <div className="knocker-tag-row">
                {data.knockTags.map((t) => (
                  <label key={t.id}>
                    <input type="checkbox" name="tags" value={t.id} defaultChecked={selectedPin?.tagIds?.includes(t.id)} />
                    {t.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <textarea name="notes" placeholder="Notes" className="field-input" rows={3} defaultValue={selectedPin?.notes} />
            <label className="board-pin">
              <input name="createLead" type="checkbox" defaultChecked />
              Create CRM lead when hot
            </label>
            <label className="board-pin">
              <input name="allowDuplicate" type="checkbox" />
              Allow duplicate address (override double-knock block)
            </label>
            <button type="submit" disabled={busy || !activeZone} className="btn-primary btn-block">
              {busy ? "Saving…" : "Save pin"}
            </button>
          </form>
          <div className="knocker-pin-list">
            <h3>Recent pins · double-knock sync</h3>
            <ul>
              {zoneKnocks.slice(0, 15).map((k) => (
                <li key={k.id}>
                  <button type="button" onClick={() => setSelectedPin(k)}>
                    <strong>{k.address}</strong>
                    <StatusBadge status={k.outcome} />
                  </button>
                  {k.visitedByIds && k.visitedByIds.length > 1 ? (
                    <span className="knocker-visited">Team visited</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === "route" ? (
        <div className="knocker-route-panel">
          <h2>Optimized canvassing route</h2>
          <p className="knocker-hint">Nearest-neighbor sequence from your GPS to zone pins.</p>
          <ol>
            {routeOrder.map((id, i) => {
              const pin = zoneKnocks.find((k) => k.id === id);
              if (!pin || pin.lat == null || pin.lng == null) return null;
              return (
                <li key={id}>
                  <span>{i + 1}. {pin.address}</span>
                  <div className="knocker-nav-btns">
                    <a href={navigationUrl(pin.lat, pin.lng, "google")} target="_blank" rel="noreferrer">
                      Google
                    </a>
                    <a href={navigationUrl(pin.lat, pin.lng, "apple")} target="_blank" rel="noreferrer">
                      Apple
                    </a>
                    <a href={navigationUrl(pin.lat, pin.lng, "waze")} target="_blank" rel="noreferrer">
                      Waze
                    </a>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {tab === "tasks" ? (
        <div className="knocker-tasks">
          <h2>Pin-linked to-dos</h2>
          <ul>
            {data.knockTodos.map((t) => (
              <li key={t.id} className={t.completedAt ? "done" : ""}>
                <strong>{t.title}</strong>
                <p>{t.body}</p>
                {t.dueAt ? <span>Due {new Date(t.dueAt).toLocaleString()}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "team" ? (
        <div className="knocker-team">
          <section>
            <h2>Live leaderboard</h2>
            <ol>
              {leaderboard.map((row, i) => (
                <li key={row.employeeId}>
                  #{i + 1} {row.name} — {row.knocks} doors · {row.appointments} appts · score {row.score}
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h2>Team chat</h2>
            <ul className="knocker-chat-log">
              {data.knockChat.slice(0, 20).map((m) => (
                <li key={m.id}>
                  <strong>{data.employees.find((e) => e.id === m.authorId)?.name ?? "Rep"}</strong>
                  <span>{m.body}</span>
                </li>
              ))}
            </ul>
            <form onSubmit={sendChat} className="knocker-chat-form">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Message team…"
                className="field-input"
              />
              <button type="submit" className="btn-primary">
                Send
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {tab === "stats" ? (
        <div className="knocker-stats-panel">
          <h2>Conversion analytics</h2>
          <div className="knocker-analytics-grid">
            <div>
              <p>Doors knocked</p>
              <strong>{zoneKnocks.length}</strong>
            </div>
            <div>
              <p>Appointments</p>
              <strong>{zoneKnocks.filter((k) => k.outcome === "appointment").length}</strong>
            </div>
            <div>
              <p>Sold</p>
              <strong>{zoneKnocks.filter((k) => k.outcome === "sold").length}</strong>
            </div>
            <div>
              <p>DNK</p>
              <strong>{zoneKnocks.filter((k) => k.outcome === "do_not_knock").length}</strong>
            </div>
          </div>
          <h3>Product catalog</h3>
          <ul>
            {data.knockProducts.map((p) => (
              <li key={p.id}>
                {p.name} — ${p.unitPrice.toLocaleString()}
              </li>
            ))}
          </ul>
          {!admin && !can("manage_zones") ? null : (
            <p className="knocker-hint">Assign turfs on the Map tab · REST: POST /api/knocker</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
