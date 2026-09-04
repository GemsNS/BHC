"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import type { PresentationManifest } from "@/lib/presentations";

type StatusResponse = {
  ok: boolean;
  unlocked: boolean;
  title?: string;
  customerName?: string;
  address?: string;
  email?: string;
  manifest?: PresentationManifest;
  error?: string;
};

function fileUrl(slug: string, rel: string): string {
  return `/presentations/${slug}/files/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function MarkdownBlock({ source }: { source: string }) {
  const html = useMemo(() => {
    marked.setOptions({ gfm: true, breaks: false });
    return marked.parse(source, { async: false }) as string;
  }, [source]);
  return (
    <div
      className="walid-md"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function WalidPresentation({ slug }: { slug: string }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mdCache, setMdCache] = useState<Record<string, string>>({});
  const [section, setSection] = useState("overview");

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/presentations/${slug}/status`);
    const json = (await res.json()) as StatusResponse;
    setStatus(json);
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onUnlock(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/presentations/${slug}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Incorrect password");
        return;
      }
      setPassword("");
      await refresh();
    } catch {
      setError("Could not unlock. Try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!status?.unlocked || !status.manifest) return;
    const paths = new Set<string>();
    for (const s of status.manifest.sections) {
      if (typeof s.md === "string") paths.add(s.md);
      if (Array.isArray(s.md)) s.md.forEach((p) => paths.add(p));
    }
    paths.add("00_README.md");
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        [...paths].map(async (p) => {
          const res = await fetch(fileUrl(slug, p));
          if (res.ok) next[p] = await res.text();
        }),
      );
      setMdCache(next);
    })();
  }, [status, slug]);

  if (!status) {
    return (
      <div className="walid-shell">
        <p className="walid-muted">Loading presentation…</p>
      </div>
    );
  }

  if (!status.unlocked) {
    return (
      <div className="walid-shell walid-lock">
        <div className="walid-lock-card">
          <p className="walid-eyebrow">BH Contracting LTD.</p>
          <h1>{status.title || "Customer presentation"}</h1>
          {status.customerName ? <p className="walid-lede">{status.customerName}</p> : null}
          {status.address ? <p className="walid-muted">{status.address}</p> : null}
          <form onSubmit={onUnlock} className="walid-lock-form">
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error ? <p className="walid-error" role="alert">{error}</p> : null}
            <button type="submit" disabled={busy}>
              {busy ? "Checking…" : "Open presentation"}
            </button>
          </form>
          <p className="walid-fine">Private link — do not share the password publicly.</p>
        </div>
      </div>
    );
  }

  const manifest = status.manifest!;
  const active = manifest.sections.find((s) => s.id === section) ?? manifest.sections[0];
  const allFiles = [
    ...manifest.files.map((f) => ({ ...f, label: f.path })),
    { ...manifest.zip, label: manifest.zip.path, path: manifest.zip.path },
  ];

  return (
    <div className="walid-shell">
      <header className="walid-top">
        <div>
          <p className="walid-eyebrow">BH Contracting LTD.</p>
          <h1>{manifest.title}</h1>
          <p className="walid-lede">{manifest.project}</p>
          <p className="walid-muted">
            Prepared for: {manifest.preparedFor} · {manifest.email}
          </p>
          <p className="walid-status">{manifest.packageStatus}</p>
        </div>
        <a className="walid-download-main" href={fileUrl(slug, manifest.zip.path)}>
          Download complete package (ZIP)
        </a>
      </header>

      <nav className="walid-nav" aria-label="Presentation sections">
        {manifest.sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === active.id ? "is-active" : undefined}
            onClick={() => setSection(s.id)}
          >
            {s.title}
          </button>
        ))}
      </nav>

      <main className="walid-main">
        <h2>{active.title}</h2>

        {active.viewer ? (
          <section className="walid-block">
            <h3>Interactive 3D viewer</h3>
            <p className="walid-muted">
              Original single-file viewer from the package (geometry embedded). Orbit, zoom, and
              switch cameras inside the frame.
            </p>
            <iframe
              title="Walid 3D Viewer"
              className="walid-viewer"
              src={fileUrl(slug, active.viewer)}
            />
            <p>
              <a href={fileUrl(slug, active.viewer)} target="_blank" rel="noreferrer">
                Open viewer in a new tab
              </a>
            </p>
          </section>
        ) : null}

        {active.images?.length ? (
          <section className="walid-block">
            <h3>Visuals</h3>
            <div className="walid-gallery">
              {active.images.map((img) => (
                <figure key={img}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(slug, img)} alt={img} />
                  <figcaption>
                    <a href={fileUrl(slug, img)}>{img.split("/").pop()}</a>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        {(typeof active.md === "string" ? [active.md] : active.md || []).map((mdPath) => (
          <section key={mdPath} className="walid-block">
            <h3>{mdPath.split("/").pop()}</h3>
            {mdCache[mdPath] ? (
              <MarkdownBlock source={mdCache[mdPath]} />
            ) : (
              <p className="walid-muted">Loading document…</p>
            )}
            <p>
              <a href={fileUrl(slug, mdPath)}>Download original {mdPath.split("/").pop()}</a>
            </p>
          </section>
        ))}

        {active.id === "downloads" || active.dir ? (
          <section className="walid-block">
            <h3>
              {active.id === "downloads"
                ? "Every file in this package"
                : `Files in ${active.dir}`}
            </h3>
            <ul className="walid-filelist">
              {allFiles
                .filter((f) =>
                  active.id === "downloads"
                    ? true
                    : active.dir
                      ? f.path === manifest.zip.path || f.path.startsWith(`${active.dir}/`)
                      : false,
                )
                .map((f) => (
                  <li key={f.path}>
                    <a href={fileUrl(slug, f.path)}>{f.label}</a>
                    <span>{formatBytes(f.size)}</span>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}
      </main>

      <footer className="walid-footer">
        <p>
          Documents and files from{" "}
          <strong>BH_Contracting_Walid_Complete_Package</strong> for the Mount Uniacke warehouse
          extension.
        </p>
      </footer>
    </div>
  );
}
