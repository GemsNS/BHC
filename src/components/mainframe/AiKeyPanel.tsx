"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  clearClientGeminiKey,
  getClientGeminiKey,
  setClientGeminiKey,
} from "@/lib/ai-client";

/** Temporary browser Gemini key for GitHub Pages / static demo — not for production secrets. */
export function AiKeyPanel({ onChange }: { onChange?: () => void }) {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setKey(getClientGeminiKey() ?? "");
  }, []);

  function save(e: FormEvent) {
    e.preventDefault();
    if (key.trim()) setClientGeminiKey(key);
    else clearClientGeminiKey();
    setSaved(true);
    onChange?.();
    window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <form className="mainframe-ai-key-panel" onSubmit={save}>
      <p className="mainframe-profile-label">BROWSER AI KEY (TEST)</p>
      <p className="mainframe-profile-meta">
        Paste Gemini key for client-side Mainframe + summarize on Pages. Stored in localStorage only.
      </p>
      <input
        type="password"
        className="field-input"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="AQ… or AIza…"
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
            onChange?.();
          }}
        >
          Clear
        </button>
      </div>
      {saved ? <p className="mainframe-ai-key-saved">Saved — refresh chat to use Gemini.</p> : null}
    </form>
  );
}
