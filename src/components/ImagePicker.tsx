"use client";

import { useState } from "react";
import { filesToDataUrls } from "@/lib/media";

export function ImagePicker({
  onChange,
  previews,
}: {
  onChange: (urls: string[]) => void;
  previews: string[];
}) {
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls = await filesToDataUrls(files);
      onChange([...previews, ...urls].slice(0, 6));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cc-image-picker">
      <label className="cc-image-pick-btn">
        {busy ? "Compressing…" : "Add photos"}
        <input
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          hidden
          disabled={busy}
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>
      {previews.length ? (
        <div className="cc-image-grid">
          {previews.map((src, i) => (
            <button
              key={i}
              type="button"
              className="cc-image-thumb"
              title="Remove"
              onClick={() => onChange(previews.filter((_, idx) => idx !== i))}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
