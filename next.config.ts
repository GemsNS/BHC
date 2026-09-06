import path from "path";
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
  // Node-only libraries that read their own asset files at runtime (pdfkit fonts, IMAP)
  serverExternalPackages: ["pdfkit", "imapflow", "mailparser", "nodemailer"],
  webpack: (config, { nextRuntime, webpack }) => {
    // With src/middleware.ts present, Next also compiles instrumentation.ts for the
    // Edge runtime. register() exits early there, but webpack still resolves the
    // Node-only scheduler graph (imapflow, nodemailer, pdfkit, node:sqlite) — swap
    // those modules for an empty stub and stub Node core modules.
    if (nextRuntime === "edge") {
      const stub = path.resolve(__dirname, "src/lib/edge-stub.ts");
      config.plugins = config.plugins ?? [];
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/lib[\\/](scheduler|events-server)(\.ts)?$/, stub),
      );
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        stream: false,
        net: false,
        tls: false,
        fs: false,
        "fs/promises": false,
        zlib: false,
        os: false,
        path: false,
        child_process: false,
        dns: false,
        http: false,
        https: false,
        url: false,
        util: false,
        events: false,
        buffer: false,
        string_decoder: false,
        assert: false,
        crypto: false,
        "node:sqlite": false,
      };
    }
    return config;
  },
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
