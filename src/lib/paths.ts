/** Base path helper for GitHub Pages / nested hosting */
export function getBasePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH || "";
}

/**
 * Prefix for raw fetch URLs only. Next.js Link and router.* already apply basePath —
 * do NOT use this for client navigation hrefs.
 */
export function withBasePath(path: string): string {
  const base = getBasePath();
  if (!base) {
    return path.startsWith("/") ? path : `/${path}`;
  }
  if (path === base || path.startsWith(`${base}/`)) return path;
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}

/** Static gh-pages demo uses localStorage instead of API routes */
export function isStaticDemo(): boolean {
  return process.env.NEXT_PUBLIC_STATIC_DEMO === "1";
}
