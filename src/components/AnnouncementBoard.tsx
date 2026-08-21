"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  clientNewId,
  clientNowIso,
  fetchJson,
  loadAppData,
  mutateAppData,
} from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import type { Announcement, Employee, EmployeeRole } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";
import { useSession } from "@/lib/session";

function visibleFor(a: Announcement, role: EmployeeRole | undefined): boolean {
  if (!a.audienceRoles.length) return true;
  if (!role) return false;
  return a.audienceRoles.includes(role);
}

export function AnnouncementBoard({ variant }: { variant: "admin" | "apps" }) {
  const { user, can } = useSession();
  const [items, setItems] = useState<Announcement[]>([]);
  const [authors, setAuthors] = useState<Employee[]>([]);

  const refresh = useCallback(async () => {
    if (isStaticDemo()) {
      const data = await loadAppData();
      setAuthors(data.employees);
      setItems(
        data.announcements
          .filter((a) => visibleFor(a, user?.role))
          .sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return b.createdAt.localeCompare(a.createdAt);
          }),
      );
      return;
    }
    try {
      const json = await fetchJson<{
        announcements: Announcement[];
        employees: Employee[];
      }>(`/api/announcements?role=${user?.role || ""}`);
      setItems(json.announcements);
      setAuthors(json.employees);
    } catch {
      const data = await loadAppData();
      setAuthors(data.employees);
      setItems(data.announcements.filter((a) => visibleFor(a, user?.role)));
    }
  }, [user?.role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !can("board_post")) return;
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const audience = form.getAll("audience").map(String) as EmployeeRole[];
    const payload = {
      title: String(form.get("title") || ""),
      body: String(form.get("body") || ""),
      authorId: user.id,
      pinned: form.get("pinned") === "on",
      audienceRoles: audience,
    };
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        d.announcements.unshift({
          id: clientNewId(),
          ...payload,
          createdAt: clientNowIso(),
        });
      });
    } else {
      await fetchJson("/api/announcements", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    formEl.reset();
    await refresh();
  }

  async function remove(id: string) {
    if (!can("board_post")) return;
    if (isStaticDemo()) {
      await mutateAppData((d) => {
        d.announcements = d.announcements.filter((a) => a.id !== id);
      });
    } else {
      await fetchJson(`/api/announcements?id=${id}`, { method: "DELETE" });
    }
    await refresh();
  }

  const authorName = (id: string) =>
    authors.find((a) => a.id === id)?.name || "Staff";

  return (
    <div className={variant === "apps" ? "board-apps" : undefined}>
      {variant === "admin" ? (
        <PageHeader
          title="Announcements"
          subtitle="Company message board — posts can target everyone or specific roles."
        />
      ) : (
        <h1 className="apps-page-heading">Announcements</h1>
      )}

      {can("board_post") ? (
        <form onSubmit={onCreate} className="board-compose">
          <h2>New post</h2>
          <input name="title" required placeholder="Title" className="field-input" />
          <textarea
            name="body"
            required
            rows={3}
            placeholder="Message"
            className="field-input"
          />
          <fieldset className="board-audience">
            <legend>Audience (leave empty = everyone)</legend>
            <div className="board-audience-grid">
              {(Object.keys(ROLE_LABELS) as EmployeeRole[]).map((role) => (
                <label key={role}>
                  <input type="checkbox" name="audience" value={role} />
                  {ROLE_LABELS[role]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="board-pin">
            <input type="checkbox" name="pinned" /> Pin to top
          </label>
          <button type="submit" className="btn-primary">
            Post announcement
          </button>
        </form>
      ) : null}

      <ul className="board-list">
        {items.map((item) => (
          <li key={item.id} className={`board-card ${item.pinned ? "pinned" : ""}`}>
            <div className="board-card-head">
              <h3>{item.title}</h3>
              {item.pinned ? <span className="pin-badge">Pinned</span> : null}
            </div>
            <p className="board-body">{item.body}</p>
            <div className="board-meta">
              <span>{authorName(item.authorId)}</span>
              <span>{new Date(item.createdAt).toLocaleString()}</span>
              {item.audienceRoles.length ? (
                <span>
                  {item.audienceRoles.map((r) => ROLE_LABELS[r]).join(", ")}
                </span>
              ) : (
                <span>Everyone</span>
              )}
            </div>
            {can("board_post") ? (
              <button
                type="button"
                className="board-delete"
                onClick={() => remove(item.id)}
              >
                Delete
              </button>
            ) : null}
          </li>
        ))}
        {items.length === 0 ? (
          <li className="board-empty">No announcements yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
