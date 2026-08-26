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

type UiMessage = ChatMessage & {
  id: string;
  source?: "ai" | "mainframe";
  toolRuns?: Array<{ tool: string; summary: string; ok: boolean }>;
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
    "BHC MAINFRAME online. I execute CRM actions — leads, workflows, invoices, prospect hunting, and daily automations. Outreach always queues for your approval before send.\n\nFeed me criteria (regions, keywords, job types) or say \"help\" for commands.",
};

export function MainframeChat({ embedded = false }: { embedded?: boolean }) {
  const { user } = useSession();
  const [messages, setMessages] = useState<UiMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<AssistantCriteriaProfile | null>(null);
  const [due, setDue] = useState<string[]>([]);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    const userMsg: UiMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((m) => [...m, userMsg]);
    setBusy(true);
    try {
      const history: ChatMessage[] = [...messages, userMsg]
        .filter((m) => m.id !== "welcome")
        .map(({ role, content }) => ({ role, content }));
      const result = await sendMainframeMessage(history, user?.id ?? "emp-admin");
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: result.reply,
          source: result.source,
          toolRuns: result.toolRuns,
        },
      ]);
      if (result.automationsDue?.length) setDue(result.automationsDue);
      await refreshMeta();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("mainframe-chat", embedded && "mainframe-chat-embedded")}>
      <header className="mainframe-chat-head">
        <div>
          <p className="mainframe-chat-eyebrow">BHC MAINFRAME AI</p>
          <h2 className="mainframe-chat-title">Command assistant</h2>
          {aiStatus ? (
            <p
              className={cn(
                "mainframe-chat-provider",
                aiStatus.configured ? "mainframe-ai-live" : "mainframe-ai-local",
              )}
            >
              {aiStatus.configured
                ? `${hasClientAiKey() ? "BROWSER GEMINI" : aiStatus.provider.toUpperCase()} · ${aiStatus.model ?? "AI"}`
                : "LOCAL PARSER — paste key in sidebar or set GEMINI_API_KEY"}
            </p>
          ) : null}
        </div>
        {!embedded ? (
          <Link href="/admin/dashboard" className="mainframe-chat-link">
            ← Deck
          </Link>
        ) : null}
      </header>

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
                  <span className="mainframe-msg-badge">{m.source.toUpperCase()}</span>
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

          <form
            className="mainframe-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
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
