/**
 * HTTP security headers for bhcontracting.ca (Next.js + Apache reverse proxy).
 * Applied via next.config.ts; Apache also strips Server / X-Powered-By (see
 * deploy/production/apache-bhc-security.conf).
 */

export type SecurityHeader = { key: string; value: string };

/**
 * Optional frame-src hosts for God's Eye embed (GODS_EYE_EMBED_URL).
 * Only same-origin by default; append allowlisted embed origin when set.
 */
export function godsEyeFrameSrcDirective(): string {
  const hosts = new Set<string>(["'self'"]);
  // Static NEXT_PUBLIC read so Next can inline at build; server env as fallback.
  const raw =
    process.env.NEXT_PUBLIC_GODS_EYE_EMBED_URL?.trim() ||
    process.env.GODS_EYE_EMBED_URL?.trim() ||
    "";
  if (raw) {
    try {
      hosts.add(new URL(raw).origin);
    } catch {
      // Soft-fail: ignore malformed embed URL rather than break CSP / boot.
    }
  }
  return `frame-src ${[...hosts].join(" ")}`;
}

/** Content-Security-Policy tuned for Next.js App Router + Leaflet OSM/Esri tiles. */
export function contentSecurityPolicy(): string {
  const directives = [
    "default-src 'self'",
    // Next.js hydration + app bundles; avoid 'unsafe-eval' in prod where possible,
    // but Next 15 still needs it for some runtime paths — keep until nonce CSP lands.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      "https://*.tile.openstreetmap.org",
      "https://nominatim.openstreetmap.org",
      "https://*.openstreetmap.org",
      // Keyless Esri World Imagery (God's Eye HRM satellite basemap)
      "https://server.arcgisonline.com",
      "https://*.arcgisonline.com",
      "https://*.arcgis.com",
    ].join(" "),
    godsEyeFrameSrcDirective(),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];
  return directives.join("; ");
}

/** Headers applied to every HTML/API response from Next. */
export function securityHeaders(): SecurityHeader[] {
  return [
    {
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains; preload",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(self), payment=()",
    },
    { key: "Content-Security-Policy", value: contentSecurityPolicy() },
    // Belt-and-suspenders if a proxy or older Next still emits it
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];
}

/** Exact DNS TXT values for GoDaddy (SPF + DMARC). */
export const DNS_SPF_RECORD =
  "v=spf1 include:spf.protection.outlook.com include:secureserver.net -all";

export const DNS_DMARC_RECORD =
  "v=DMARC1; p=reject; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;";
