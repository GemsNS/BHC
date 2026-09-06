import type { NextConfig } from "next";

const isStatic = process.env.NEXT_PUBLIC_STATIC_DEMO === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
/**
 * deploy/production/deploy.sh builds into a side directory (NEXT_DIST_DIR=.next-build)
 * and swaps it into .next only after the build succeeds, so a failed build never
 * leaves the running service with a half-written bundle. Unset → default ".next".
 */
const distDir = process.env.NEXT_DIST_DIR?.trim() || undefined;

const nextConfig: NextConfig = {
  ...(distDir ? { distDir } : {}),
  ...(isStatic
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
  ...(basePath
    ? {
        basePath,
        assetPrefix: basePath,
      }
    : {}),
};

export default nextConfig;
