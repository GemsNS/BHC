"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  clearClientGeminiKey,
  getClientGeminiKey,
  getClientGeminiModel,
  hasClientAiKey,
  setClientGeminiKey,
} from "@/lib/ai-client";

/** Temporary browser Gemini key for GitHub Pages / static demo — not for production secrets. */
export function AiKeyPanel({ onChange }: { onChange?: () => void }) {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const existing = getClientGeminiKey() ?? "";
    setKey(existing);
    setActive(Boolean(existing));
  }, []);

  function save(e: FormEvent) {
    e.preventDefault();
    if (key.trim()) {
      setClientGeminiKey(key);
      setActive(true);
    } else {
      clearClientGeminiKey();
      setActive(false);
    }
    setSaved(true);
    onChange?.();
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <form className="mainframe-ai-key-panel" onSubmit={save}>
      <p className="mainframe-profile-label">BROWSER AI KEY (TEST)</p>
      <p className="mainframe-profile-meta">
        Paste a Gemini API key from Google AI Studio. Saved in this browser only
        (localStorage). Works on GitHub Pages without a server .env.
      </p>
      <input
        type="password"
        className="field-input"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="AIza… Gemini API key"
        autoComplete="off"
      />
      <div className="mainframe-ai-key-actions">
        <button type="submit" className="mainframe-panel-btn">
          Save key
        </button>
        <button
          type="button"
          className="mainframe-panel-btn mainframe-panel-btn-muted"
          onClick={() => {
            clearClientGeminiKey();
            setKey("");
            setActive(false);
            onChange?.();
          }}
        >
          Clear
        </button>
      </div>
      {active || hasClientAiKey() ? (
        <p className="mainframe-ai-key-saved">
          Active · {getClientGeminiModel()} — chat uses browser Gemini now.
        </p>
      ) : null}
      {saved ? (
        <p className="mainframe-ai-key-saved">
          Saved — status updates immediately (no page refresh needed).
        </p>
      ) : null}
    </form>
  );
}
