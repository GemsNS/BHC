import { afterEach, describe, expect, it } from "vitest";
import {
  godsEyeConfigStatus,
  godsEyeEnabled,
  godsEyeEmbedUrl,
  HRM_CENTER,
  isGodsEyeNavHref,
  navItemVisibleForFlags,
} from "@/lib/gods-eye";

const FLAG_KEYS = [
  "GODS_EYE_ENABLED",
  "NEXT_PUBLIC_GODS_EYE_ENABLED",
  "GODS_EYE_EMBED_URL",
  "NEXT_PUBLIC_GODS_EYE_EMBED_URL",
  "CESIUM_ION_TOKEN",
  "NEXT_PUBLIC_CESIUM_ION_TOKEN",
  "GOOGLE_MAPS_API_KEY",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
] as const;

afterEach(() => {
  for (const k of FLAG_KEYS) delete process.env[k];
});

describe("godsEyeEnabled", () => {
  it("defaults OFF (Twilio-style kill-switch)", () => {
    expect(godsEyeEnabled()).toBe(false);
  });

  it("turns on with GODS_EYE_ENABLED=1", () => {
    process.env.GODS_EYE_ENABLED = "1";
    expect(godsEyeEnabled()).toBe(true);
  });

  it("accepts true/yes/on", () => {
    process.env.GODS_EYE_ENABLED = "true";
    expect(godsEyeEnabled()).toBe(true);
    process.env.GODS_EYE_ENABLED = "yes";
    expect(godsEyeEnabled()).toBe(true);
    process.env.GODS_EYE_ENABLED = "on";
    expect(godsEyeEnabled()).toBe(true);
  });

  it("stays off for 0 / false", () => {
    process.env.GODS_EYE_ENABLED = "0";
    expect(godsEyeEnabled()).toBe(false);
    process.env.GODS_EYE_ENABLED = "false";
    expect(godsEyeEnabled()).toBe(false);
  });

  it("falls back to NEXT_PUBLIC_GODS_EYE_ENABLED when server flag unset", () => {
    process.env.NEXT_PUBLIC_GODS_EYE_ENABLED = "1";
    expect(godsEyeEnabled()).toBe(true);
  });
});

describe("navItemVisibleForFlags", () => {
  it("hides God's Eye nav when disabled", () => {
    expect(isGodsEyeNavHref("/admin/gods-eye")).toBe(true);
    expect(navItemVisibleForFlags("/admin/gods-eye")).toBe(false);
    expect(navItemVisibleForFlags("/admin/dashboard")).toBe(true);
  });

  it("shows God's Eye nav when enabled", () => {
    process.env.GODS_EYE_ENABLED = "1";
    expect(navItemVisibleForFlags("/admin/gods-eye")).toBe(true);
  });
});

describe("godsEyeConfigStatus", () => {
  it("centers on HRM and soft-fails missing keys", () => {
    const s = godsEyeConfigStatus();
    expect(s.enabled).toBe(false);
    expect(s.region.lat).toBeCloseTo(44.6488, 3);
    expect(s.region.lng).toBeCloseTo(-63.5752, 3);
    expect(s.region.label).toMatch(/Halifax Regional Municipality/i);
    expect(s.cesiumIonConfigured).toBe(false);
    expect(s.googleMapsConfigured).toBe(false);
    expect(s.embedUrl).toBeNull();
  });

  it("reports optional keys and embed without requiring them", () => {
    process.env.GODS_EYE_ENABLED = "1";
    process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN = "ion-test";
    process.env.GOOGLE_MAPS_API_KEY = "gmaps-test";
    process.env.GODS_EYE_EMBED_URL = "https://gev.example.com/";
    const s = godsEyeConfigStatus();
    expect(s.enabled).toBe(true);
    expect(s.cesiumIonConfigured).toBe(true);
    expect(s.googleMapsConfigured).toBe(true);
    expect(godsEyeEmbedUrl()).toBe("https://gev.example.com/");
    expect(s.embedUrl).toBe("https://gev.example.com/");
  });
});

describe("HRM_CENTER", () => {
  it("uses a reasonable regional zoom", () => {
    expect(HRM_CENTER.zoom).toBeGreaterThanOrEqual(9);
    expect(HRM_CENTER.zoom).toBeLessThanOrEqual(14);
    expect(HRM_CENTER.shortLabel).toBe("HRM");
  });
});
