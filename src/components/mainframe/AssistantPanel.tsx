"use client";

import { useCallback, useEffect, useState } from "react";
import { loadAppData, saveAppData, fetchJson, clientNewId } from "@/lib/client-data";
import { isStaticDemo } from "@/lib/paths";
import { runDailyAutomations, runAutomation } from "@/lib/mainframe-automations";
import type { AIStatus } from "@/lib/ai-provider";
import type { AssistantAuditEntry, AssistantDailyAutomation } from "@/lib/types";
import { cn } from "@/lib/utils";

type AssistantData = {
  automations: AssistantDailyAutomation[];
  audit: AssistantAuditEntry[];
  due: string[];
};

export function AssistantPanel({ onMessage }: { onMessage?: (text: string) => void }) {
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [data, setData] = useState<AssistantData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (isStaticDemo()) {
      const store = await loadAppData();
      const hour = new Date().getHours();
      setAiStatus({
        provider: "none",
        configured: false,
        model: null,
        chat: false,
        summarize: false,
        gemini: false,
        openai: false,
      });
      setData({
        automations: store.assistantAutomations,
        audit: store.assistantAudit.slice(0, 8),
        due: store.assistantAutomations
          .filter(
            (a) =>
              a.enabled &&
              a.runHour <= hour &&
              (!a.lastRunAt ||
                new Date(a.lastRunAt).toDateString() !== new Date().toDateString()),
          )
          .map((a) => a.name),
      });
      return;
    }

    try {
      const [status, assistant] = await Promise.all([
        fetchJson<AIStatus>("/api/ai/status"),
        fetchJson<AssistantData>("/api/assistant"),
      ]);
      setAiStatus(status);
      setData(assistant);
    } catch {
      const store = await loadAppData();
      setData({
        automations: store.assistantAutomations,
        audit: store.assistantAudit.slice(0, 8),
        due: [],
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function runDaily(force = false) {
    setBusy("daily");
    try {
      if (isStaticDemo()) {
        const store = await loadAppData();
        const summaries = runDailyAutomations(store, clientNewId, { force });
        await saveAppData(store);
        onMessage?.(summaries.join("\n") || "No automations ran.");
      } else {
        const res = await fetchJson<{ summary: string | string[] }>("/api/assistant", {
          method: "POST",
          body: JSON.stringify({ action: "run_daily", force }),
        });
        const text = Array.isArray(res.summary) ? res.summary.join("\n") : res.summary;
        onMessage?.(text);
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function runOne(id: string) {
    setBusy(id);
    try {
      if (isStaticDemo()) {
        const store = await loadAppData();
        const auto = store.assistantAutomations.find((a) => a.id === id);
        if (!auto) return;
        const summary = runAutomation(store, auto, clientNewId);
        await saveAppData(store);
        onMessage?.(summary);
      } else {
        const res = await fetchJson<{ summary: string }>("/api/assistant", {
          method: "POST",
          body: JSON.stringify({ action: "run_automation", automationId: id }),
        });
        onMessage?.(res.summary);
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const providerLabel =
    aiStatus?.configured && aiStatus.provider !== "none"
      ? `${aiStatus.provider.toUpperCase()} · ${aiStatus.model ?? "model"}`
      : "LOCAL PARSER";

  return (
    <aside className="mainframe-assistant-panel">
      <div className="mainframe-assistant-block">
        <p className="mainframe-profile-label">AI ENGINE</p>
        <p
          className={cn(
            "mainframe-ai-status",
            aiStatus?.configured ? "mainframe-ai-live" : "mainframe-ai-local",
          )}
        >
          {providerLabel}
        </p>
        {!aiStatus?.configured ? (
          <p className="mainframe-profile-meta">
            Set GEMINI_API_KEY or OPENAI_API_KEY in .env for full natural-language control.
          </p>
        ) : null}
      </div>

      {data?.due.length ? (
        <div className="mainframe-assistant-block">
          <p className="mainframe-profile-label">DUE NOW</p>
          <p className="mainframe-profile-meta">{data.due.join(" · ")}</p>
          <button
            type="button"
            className="mainframe-panel-btn"
            disabled={!!busy}
            onClick={() => runDaily(false)}
          >
            {busy === "daily" ? "Running…" : "Run due automations"}
          </button>
        </div>
      ) : null}

      <div className="mainframe-assistant-block">
        <p className="mainframe-profile-label">DAILY AUTOMATIONS</p>
        <ul className="mainframe-auto-list">
          {(data?.automations ?? []).map((a) => (
            <li key={a.id}>
              <span>{a.enabled ? "●" : "○"} {a.name}</span>
              {a.enabled ? (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => runOne(a.id)}
                >
                  {busy === a.id ? "…" : "Run"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mainframe-panel-btn mainframe-panel-btn-muted"
          disabled={!!busy}
          onClick={() => runDaily(true)}
        >
          Force run all
        </button>
      </div>

      {data?.audit.length ? (
        <div className="mainframe-assistant-block">
          <p className="mainframe-profile-label">AUDIT LOG</p>
          <ul className="mainframe-audit-list">
            {data.audit.map((e) => (
              <li key={e.id}>
                <span className="mainframe-audit-action">{e.action}</span>
                <span className="mainframe-audit-detail">{e.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
