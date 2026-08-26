"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSession } from "@/lib/session";
import {
  completeKnockTodo,
  createCalendarEvent,
  createKnockPin,
  createKnockProposal,
  createKnockTodo,
  createTerritory,
  loadKnockerData,
  pingRepLocation,
  postKnockChat,
  saveGpsConfigClient,
  signKnockProposal,
  type KnockerPayload,
} from "@/lib/knocker/client";
import { buildKnockerLeaderboard } from "@/lib/knocker/ops";
import { DEFAULT_KNOCK_COLORS } from "@/lib/knocker/colors";
import { navigationUrl, optimizeRoute } from "@/lib/knocker/route";
import type { CanvassOutcome, KnockEvent } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import type { LatLng } from "@/lib/knocker/geo";
import { SignaturePad } from "@/components/knocker/SignaturePad";
import { buildIcs, downloadIcs, googleCalendarUrl } from "@/lib/calendar";
import {
  requestBrowserNotificationPermission,
  showBrowserNotification,
} from "@/lib/notifications";
import { DEFAULT_GPS_CONFIG, loadGpsConfig, saveGpsConfig, startGpsTracker } from "@/lib/gps-tracker";
import type { GpsTrackingConfig, KnockProposal } from "@/lib/types";
import { KnockerZonesPanel } from "@/components/knocker/KnockerZonesPanel";
import { isStaticDemo } from "@/lib/paths";

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

type Tab = "map" | "zones" | "pin" | "route" | "tasks" | "propose" | "team" | "stats";

const TAB_IDS: Tab[] = ["map", "zones", "pin", "route", "tasks", "propose", "team", "stats"];

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
  const [gpsCfg, setGpsCfg] = useState(DEFAULT_GPS_CONFIG);
  const [notifyPerm, setNotifyPerm] = useState("default");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [signerName, setSignerName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [activeProposal, setActiveProposal] = useState<KnockProposal | null>(null);
  const [todoTitle, setTodoTitle] = useState("");
  const [todoDue, setTodoDue] = useState("");

  const refresh = useCallback(async () => {
    const payload = await loadKnockerData();
    setData(payload);
    if (!zoneId && payload.zones[0]) setZoneId(payload.zones[0].id);
  }, [zoneId]);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TAB_IDS.includes(t as Tab)) setTab(t as Tab);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!data) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      for (const t of data.knockTodos) {
        if (t.completedAt || !t.dueAt || t.reminderSentAt) continue;
        const due = new Date(t.dueAt).getTime();
        if (due <= now + 15 * 60_000 && due >= now - 60_000) {
          showBrowserNotification("Knocker reminder", t.title, "/apps/knocker");
          navigator.serviceWorker?.controller?.postMessage({
            type: "notify",
            title: "Knocker reminder",
            body: t.title,
            href: "/apps/knocker",
          });
        }
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [data]);

  useEffect(() => {
    const cfg = loadGpsConfig();
    setGpsCfg(cfg);
    if (typeof Notification !== "undefined") setNotifyPerm(Notification.permission);
  }, []);

  useEffect(() => {
    if (!gpsCfg) return;
    const tracker = startGpsTracker(gpsCfg, (pt) => {
      setCoords({ lat: pt.lat, lng: pt.lng });
      if (user?.id) void pingRepLocation(user.id, pt.lat, pt.lng);
    });
    return () => tracker?.stop();
  }, [user?.id, gpsCfg]);

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
          <h1>{admin ? "Active Knocker command" : "Door knocker"}</h1>
        </div>
        <div className="knocker-command-stats">
          <span>GPS {coords ? "LIVE" : "OFF"}</span>
          <span>{zoneKnocks.length} pins</span>
          <span>{territories.length} turfs</span>
          <span>{myZones.length} zones</span>
        </div>
      </header>

      {isStaticDemo() ? (
        <p className="knocker-msg banner">
          Static Pages demo — map, zones, pins, and turfs save in this browser (localStorage).
          Multi-user sync and webhooks need a Node host.
        </p>
      ) : null}

      <div className="knocker-command-toolbar">
        <select
          className="field-input"
          value={activeZone?.id ?? ""}
          onChange={(e) => setZoneId(e.target.value)}
        >
          {myZones.length ? (
            myZones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name} · {z.neighborhood}
              </option>
            ))
          ) : (
            <option value="">No zones — open Zones tab to create one</option>
          )}
        </select>
        <nav className="knocker-tabs">
          {(
            [
              ["map", "Map"],
              ["zones", "Zones"],
              ["pin", "Pin"],
              ["route", "Route"],
              ["tasks", "Tasks"],
              ["propose", "Propose"],
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

      {tab === "zones" ? (
        <KnockerZonesPanel
          zones={data.zones}
          knocks={data.knocks}
          employees={data.employees}
          onChanged={refresh}
        />
      ) : null}

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
          <h2>Pin-linked to-dos + calendar</h2>
          <form
            className="knocker-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!user || !todoTitle.trim()) return;
              const todo = await createKnockTodo({
                pinId: selectedPin?.id ?? null,
                title: todoTitle.trim(),
                dueAt: todoDue ? new Date(todoDue).toISOString() : null,
                assignedToId: user.id,
                priority: "high",
              });
              if (todo.dueAt) {
                await createCalendarEvent({
                  title: todo.title,
                  startAt: todo.dueAt,
                  location: selectedPin?.address,
                  pinId: selectedPin?.id,
                  todoId: todo.id,
                  employeeId: user.id,
                });
              }
              setTodoTitle("");
              setTodoDue("");
              setMessage("Task saved — add to Google Calendar from the list.");
              await refresh();
            }}
          >
            <input
              className="field-input"
              placeholder="Follow-up title"
              value={todoTitle}
              onChange={(e) => setTodoTitle(e.target.value)}
            />
            <input
              className="field-input"
              type="datetime-local"
              value={todoDue}
              onChange={(e) => setTodoDue(e.target.value)}
            />
            <button type="submit" className="btn-primary">Add task</button>
          </form>
          <p className="knocker-hint">
            Notifications: {notifyPerm}
            <button
              type="button"
              className="knocker-inline-btn"
              onClick={async () => {
                const perm = await requestBrowserNotificationPermission();
                setNotifyPerm(perm);
                if (perm === "granted") {
                  showBrowserNotification("BHC Knocker", "Reminders armed for due tasks.");
                }
              }}
            >
              Enable push
            </button>
          </p>
          <ul>
            {data.knockTodos.map((t) => {
              const ev = data.knockCalendarEvents.find((c) => c.id === t.calendarEventId) ??
                data.knockCalendarEvents.find((c) => c.todoId === t.id);
              return (
                <li key={t.id} className={t.completedAt ? "done" : ""}>
                  <strong>{t.title}</strong>
                  <p>{t.body}</p>
                  {t.dueAt ? <span>Due {new Date(t.dueAt).toLocaleString()}</span> : null}
                  <div className="knocker-nav-btns">
                    {!t.completedAt ? (
                      <button type="button" onClick={async () => { await completeKnockTodo(t.id); await refresh(); }}>
                        Complete
                      </button>
                    ) : null}
                    {ev ? (
                      <>
                        <a href={googleCalendarUrl({
                          uid: ev.icsUid,
                          title: ev.title,
                          description: ev.description,
                          location: ev.location,
                          startAt: ev.startAt,
                          endAt: ev.endAt,
                        })} target="_blank" rel="noreferrer">Google</a>
                        <button
                          type="button"
                          onClick={() =>
                            downloadIcs(
                              ev.title,
                              buildIcs({
                                uid: ev.icsUid,
                                title: ev.title,
                                description: ev.description,
                                location: ev.location,
                                startAt: ev.startAt,
                                endAt: ev.endAt,
                              }),
                            )
                          }
                        >
                          .ics
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {tab === "propose" ? (
        <div className="knocker-propose">
          <h2>On-site proposal + sign-off</h2>
          <p className="knocker-hint">
            Pin: {selectedPin?.address ?? "select a pin on Map/Pin first"}
          </p>
          <fieldset>
            <legend>Products</legend>
            {data.knockProducts.map((p) => (
              <label key={p.id} className="board-pin">
                <input
                  type="checkbox"
                  checked={productIds.includes(p.id)}
                  onChange={(e) =>
                    setProductIds((ids) =>
                      e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id),
                    )
                  }
                />
                {p.name} (${p.unitPrice.toLocaleString()})
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Services</legend>
            {data.knockServices.map((s) => (
              <label key={s.id} className="board-pin">
                <input
                  type="checkbox"
                  checked={serviceIds.includes(s.id)}
                  onChange={(e) =>
                    setServiceIds((ids) =>
                      e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id),
                    )
                  }
                />
                {s.name} (${s.basePrice.toLocaleString()})
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="btn-primary"
            disabled={!selectedPin || !user}
            onClick={async () => {
              if (!selectedPin || !user) return;
              const p = await createKnockProposal({
                pinId: selectedPin.id,
                createdById: user.id,
                productIds,
                serviceIds,
              });
              setActiveProposal(p);
              setMessage(`Draft proposal ${p.id.slice(0, 8)} · $${p.total.toLocaleString()}`);
              await refresh();
            }}
          >
            Build proposal
          </button>
          {(activeProposal ?? data.knockProposals[0]) ? (
            <div className="knocker-proposal-card">
              {(() => {
                const p = activeProposal ?? data.knockProposals[0];
                return (
                  <>
                    <h3>Proposal {p.status.toUpperCase()} · ${p.total.toLocaleString()}</h3>
                    <ul>
                      {p.lineItems.map((l) => (
                        <li key={l.label}>{l.label} — ${l.amount.toLocaleString()}</li>
                      ))}
                    </ul>
                    {p.status !== "signed" ? (
                      <>
                        <input
                          className="field-input"
                          placeholder="Signer legal name"
                          value={signerName}
                          onChange={(e) => setSignerName(e.target.value)}
                        />
                        <SignaturePad onChange={setSignature} />
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={!signerName || !signature}
                          onClick={async () => {
                            const signed = await signKnockProposal({
                              proposalId: p.id,
                              signerName,
                              signatureDataUrl: signature!,
                            });
                            setActiveProposal(signed);
                            setMessage(`Signed by ${signed.signerName}`);
                            await refresh();
                          }}
                        >
                          Capture sign-off
                        </button>
                      </>
                    ) : (
                      <div>
                        <p>Signed by {p.signerName} at {p.signedAt ? new Date(p.signedAt).toLocaleString() : ""}</p>
                        {p.signatureDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.signatureDataUrl} alt="Customer signature" className="signature-preview" />
                        ) : null}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ) : null}
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
            <p className="knocker-hint">Assign turfs on the Map tab · REST: POST /api/knocker · Webhooks: /api/webhooks</p>
          )}
          <h3>Background GPS (distanceFilter / desiredAccuracy)</h3>
          <label className="field">
            Distance filter (m)
            <input
              className="field-input"
              type="number"
              min={5}
              max={500}
              value={gpsCfg.distanceFilterMeters}
              onChange={(e) => setGpsCfg({ ...gpsCfg, distanceFilterMeters: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            Accuracy
            <select
              className="field-input"
              value={gpsCfg.desiredAccuracy}
              onChange={(e) =>
                setGpsCfg({ ...gpsCfg, desiredAccuracy: e.target.value as GpsTrackingConfig["desiredAccuracy"] })
              }
            >
              <option value="high">High (GPS)</option>
              <option value="balanced">Balanced</option>
              <option value="low">Low (battery)</option>
            </select>
          </label>
          <label className="board-pin">
            <input
              type="checkbox"
              checked={gpsCfg.wakeLock}
              onChange={(e) => setGpsCfg({ ...gpsCfg, wakeLock: e.target.checked })}
            />
            Screen wake lock while canvassing
          </label>
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              saveGpsConfig(gpsCfg);
              await saveGpsConfigClient({
                ...gpsCfg,
                enabled: true,
              });
              setMessage("GPS profile saved — tracker restarts with new filters.");
            }}
          >
            Save GPS profile
          </button>
        </div>
      ) : null}
    </div>
  );
}
