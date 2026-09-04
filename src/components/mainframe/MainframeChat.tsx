"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ChatMessage } from "@/lib/mainframe-agent";
import { sendMainframeMessage } from "@/lib/mainframe-client";
import { fetchJson, loadAppData } from "@/lib/client-data";
import { hasClientAiKey, browserAiStatus, CLIENT_AI_KEY_EVENT } from "@/lib/ai-client";
import type { AIStatus } from "@/lib/ai-provider";
import { isStaticDemo } from "@/lib/paths";
import type { AssistantCriteriaProfile } from "@/lib/types";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { MAINFRAME_AGENTS, type MainframeAgentId } from "@/lib/mainframe-agents";

type UiMessage = ChatMessage & {
  id: string;
  source?: "ai" | "mainframe";
  toolRuns?: Array<{ tool: string; summary: string; ok: boolean }>;
  agentId?: string;
};

type UploadRecord = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
};

const QUICK = [
  "CRM summary",
  "Hunt leads using my criteria",
  "Approve all outreach",
  "Run daily automations",
  "List qualified leads",
  "Generate invoice for Harbor Lane",
  "help",
];

const WELCOME: UiMessage = {
  id: "welcome",
  role: "assistant",
  source: "mainframe",
  content:
    "BHC MAINFRAME online. Pick an agent (Orchestrator / CRM / Estimator / Research / Design·Manus), attach files, and run CRM actions. Outreach always queues for approval before send.\n\nPreferred server AI: Claude (ANTHROPIC_API_KEY). Gemini remains optional.",
};

export function MainframeChat({ embedded = false }: { embedded?: boolean }) {
  const { user } = useSession();
  const [messages, setMessages] = useState<UiMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<AssistantCriteriaProfile | null>(null);
  const [due, setDue] = useState<string[]>([]);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [agentId, setAgentId] = useState<MainframeAgentId>("orchestrator");
  const [attachments, setAttachments] = useState<UploadRecord[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshMeta = useCallback(async () => {
    const data = await loadAppData();
    setProfile(data.assistantProfiles.find((p) => p.enabled) ?? data.assistantProfiles[0] ?? null);
    const hour = new Date().getHours();
    setDue(
      data.assistantAutomations
        .filter(
          (a) =>
            a.enabled &&
            a.runHour <= hour &&
            (!a.lastRunAt ||
              new Date(a.lastRunAt).toDateString() !== new Date().toDateString()),
        )
        .map((a) => a.name),
    );
    if (!isStaticDemo()) {
      try {
        const server = await fetchJson<AIStatus>("/api/ai/status");
        setAiStatus(browserAiStatus(server));
      } catch {
        setAiStatus(browserAiStatus(null));
      }
    } else {
      setAiStatus(browserAiStatus(null));
    }
  }, []);

  useEffect(() => {
    refreshMeta();
    const onKey = () => {
      void refreshMeta();
    };
    window.addEventListener(CLIENT_AI_KEY_EVENT, onKey);
    return () => window.removeEventListener(CLIENT_AI_KEY_EVENT, onKey);
  }, [refreshMeta]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function onPickFiles(files: FileList | null) {
    if (!files?.length || isStaticDemo()) return;
    setUploadError(null);
    const form = new FormData();
    Array.from(files).slice(0, 6).forEach((f) => form.append("files", f));
    try {
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const json = (await res.json()) as { error?: string; files?: UploadRecord[] };
      if (!res.ok) {
        setUploadError(json.error || "Upload failed");
        return;
      }
      setAttachments((prev) => [...prev, ...(json.files ?? [])]);
    } catch {
      setUploadError("Upload failed");
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    const attachNote = attachments.length
      ? `\n\n[Attachments: ${attachments.map((a) => a.originalName).join(", ")}]`
      : "";
    const userMsg: UiMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed + attachNote,
      agentId,
    };
    setMessages((m) => [...m, userMsg]);
    setBusy(true);
    try {
      const history: ChatMessage[] = [...messages, userMsg]
        .filter((m) => m.id !== "welcome")
        .map(({ role, content }) => ({ role, content }));
      const result = await sendMainframeMessage(history, user?.id ?? "emp-admin", {
        agentId,
        attachmentIds: attachments.map((a) => a.id),
      });
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: result.reply,
          source: result.source,
          toolRuns: result.toolRuns,
          agentId: result.agentId ?? agentId,
        },
      ]);
      setAttachments([]);
      if (result.automationsDue?.length) setDue(result.automationsDue);
      await refreshMeta();
    } finally {
      setBusy(false);
    }
  }

  const providerLabel = (() => {
    if (!aiStatus) return null;
    if (aiStatus.configured) {
      const name =
        isStaticDemo() && hasClientAiKey()
          ? "BROWSER GEMINI"
          : aiStatus.provider === "anthropic"
            ? "CLAUDE"
            : aiStatus.provider.toUpperCase();
      return `${name} · ${aiStatus.model ?? "AI"}`;
    }
    return isStaticDemo()
      ? "LOCAL PARSER — set ANTHROPIC_API_KEY on server or paste Gemini key in static demo"
      : "Configure ANTHROPIC_API_KEY (Claude) on server for full AI";
  })();

  return (
    <div className={cn("mainframe-chat", embedded && "mainframe-chat-embedded")}>
      <header className="mainframe-chat-head">
        <div>
          <p className="mainframe-chat-eyebrow">BHC MAINFRAME AI</p>
          <h2 className="mainframe-chat-title">Command assistant</h2>
          {providerLabel ? (
            <p
              className={cn(
                "mainframe-chat-provider",
                aiStatus?.configured ? "mainframe-ai-live" : "mainframe-ai-local",
              )}
            >
              {providerLabel}
            </p>
          ) : null}
        </div>
        {!embedded ? (
          <Link href="/admin/dashboard" className="mainframe-chat-link">
            ← Deck
          </Link>
        ) : null}
      </header>

      <div className="mainframe-agent-row" role="tablist" aria-label="Mainframe agents">
        {MAINFRAME_AGENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={agentId === a.id}
            className={cn("mainframe-agent-chip", agentId === a.id && "is-active")}
            title={a.blurb}
            onClick={() => setAgentId(a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {due.length ? (
        <div className="mainframe-due-banner">
          <span>AUTOMATIONS DUE:</span> {due.join(" · ")}
          <button type="button" onClick={() => send("Run daily automations")}>
            Run now
          </button>
        </div>
      ) : null}

      <div className="mainframe-chat-body">
        {profile ? (
          <aside className="mainframe-profile">
            <p className="mainframe-profile-label">HUNT CRITERIA</p>
            <p className="mainframe-profile-name">{profile.name}</p>
            <p className="mainframe-profile-meta">
              {profile.regions.join(", ") || "Any region"}
            </p>
            <p className="mainframe-profile-meta">{profile.keywords.join(" · ")}</p>
            <p className="mainframe-profile-tone">{profile.outreachTone}</p>
          </aside>
        ) : null}

        <div className="mainframe-thread-wrap">
          <div className="mainframe-thread" ref={scrollRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "mainframe-msg",
                  m.role === "user" ? "mainframe-msg-user" : "mainframe-msg-ai",
                )}
              >
                {m.role === "assistant" && m.source ? (
                  <span className="mainframe-msg-badge">
                    {m.source.toUpperCase()}
                    {m.agentId ? ` · ${m.agentId}` : ""}
                  </span>
                ) : null}
                <p className="mainframe-msg-text">{m.content}</p>
                {m.toolRuns?.length ? (
                  <ul className="mainframe-tool-runs">
                    {m.toolRuns.map((t) => (
                      <li key={t.tool} className={t.ok ? "mainframe-tool-ok" : "mainframe-tool-fail"}>
                        {t.tool}: {t.summary}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
            {busy ? <p className="mainframe-typing">Processing command…</p> : null}
          </div>

          <div className="mainframe-quick">
            {QUICK.map((q) => (
              <button key={q} type="button" onClick={() => send(q)} disabled={busy}>
                {q}
              </button>
            ))}
          </div>

          {attachments.length ? (
            <ul className="mainframe-attach-list">
              {attachments.map((a) => (
                <li key={a.id}>
                  {a.originalName}{" "}
                  <button type="button" onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}>
                    remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {uploadError ? <p className="mainframe-upload-error">{uploadError}</p> : null}

          <form
            className="mainframe-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            {!isStaticDemo() ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="mainframe-file-input"
                  accept="image/*,.pdf,.txt,.csv,.json,.docx,.xlsx"
                  onChange={(e) => {
                    void onPickFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="mainframe-attach-btn"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  Attach
                </button>
              </>
            ) : null}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Command the CRM — create leads, hunt prospects, generate invoices…"
              disabled={busy}
              aria-label="Mainframe command"
            />
            <button type="submit" disabled={busy || !input.trim()}>
              Execute
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
