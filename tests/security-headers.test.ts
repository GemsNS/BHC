import { describe, expect, it } from "vitest";
import {
  DNS_DMARC_RECORD,
  DNS_SPF_RECORD,
  contentSecurityPolicy,
  securityHeaders,
} from "@/lib/security-headers";

describe("securityHeaders", () => {
  it("includes HSTS, XCTO, and CSP", () => {
    const map = Object.fromEntries(securityHeaders().map((h) => [h.key, h.value]));
    expect(map["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(map["Strict-Transport-Security"]).toContain("includeSubDomains");
    expect(map["X-Content-Type-Options"]).toBe("nosniff");
    expect(map["X-Frame-Options"]).toBe("DENY");
    expect(map["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(map["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("allows Leaflet OSM tiles in CSP", () => {
    const csp = contentSecurityPolicy();
    expect(csp).toContain("tile.openstreetmap.org");
    expect(csp).toContain("nominatim.openstreetmap.org");
  });
});

describe("DNS mail auth records", () => {
  it("SPF authorizes Microsoft 365 and keeps GoDaddy include", () => {
    expect(DNS_SPF_RECORD).toContain("include:spf.protection.outlook.com");
    expect(DNS_SPF_RECORD).toContain("include:secureserver.net");
    expect(DNS_SPF_RECORD.startsWith("v=spf1")).toBe(true);
    expect(DNS_SPF_RECORD.endsWith("-all")).toBe(true);
  });

  it("DMARC uses reject with rua reporting", () => {
    expect(DNS_DMARC_RECORD).toContain("p=reject");
    expect(DNS_DMARC_RECORD).toContain("rua=mailto:dmarc_rua@onsecureserver.net");
  });
});
