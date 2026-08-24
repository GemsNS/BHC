/** Battery-aware GPS with distanceFilter + desiredAccuracy (Active Knocker-style). */

export type GpsAccuracy = "high" | "balanced" | "low";

export type GpsConfig = {
  distanceFilterMeters: number;
  desiredAccuracy: GpsAccuracy;
  wakeLock: boolean;
};

export const DEFAULT_GPS_CONFIG: GpsConfig = {
  distanceFilterMeters: 25,
  desiredAccuracy: "balanced",
  wakeLock: true,
};

const STORAGE_KEY = "bhc-gps-config";

export function loadGpsConfig(): GpsConfig {
  if (typeof window === "undefined") return DEFAULT_GPS_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GPS_CONFIG;
    return { ...DEFAULT_GPS_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_GPS_CONFIG;
  }
}

export function saveGpsConfig(cfg: GpsConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function watchOptions(accuracy: GpsAccuracy, batteryLow: boolean): PositionOptions {
  const mode = batteryLow ? "low" : accuracy;
  if (mode === "high") {
    return { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };
  }
  if (mode === "low") {
    return { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 };
  }
  return { enableHighAccuracy: true, maximumAge: 8000, timeout: 12000 };
}

function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type GpsTracker = {
  stop: () => void;
};

export function startGpsTracker(
  config: GpsConfig,
  onPoint: (pt: { lat: number; lng: number; accuracy: number | null }) => void,
): GpsTracker | null {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;

  let last: { lat: number; lng: number } | null = null;
  let watchId: number | null = null;
  let wake: WakeLockSentinel | null = null;
  let batteryLow = false;
  let cancelled = false;

  const startWatch = () => {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (last && metersBetween(last, pt) < config.distanceFilterMeters) return;
        last = pt;
        onPoint({
          lat: pt.lat,
          lng: pt.lng,
          accuracy: pos.coords.accuracy ?? null,
        });
      },
      () => undefined,
      watchOptions(config.desiredAccuracy, batteryLow),
    );
  };

  startWatch();

  if (config.wakeLock && "wakeLock" in navigator) {
    navigator.wakeLock.request("screen").then((lock) => {
      if (cancelled) {
        void lock.release();
        return;
      }
      wake = lock;
    }).catch(() => undefined);
  }

  const vis = () => {
    if (document.visibilityState === "visible") startWatch();
  };
  document.addEventListener("visibilitychange", vis);

  if ("getBattery" in navigator) {
    (navigator as Navigator & { getBattery?: () => Promise<{ level: number; addEventListener: (ev: string, fn: () => void) => void }> })
      .getBattery?.()
      .then((b) => {
        const apply = () => {
          batteryLow = b.level < 0.15;
          startWatch();
        };
        apply();
        b.addEventListener("levelchange", apply);
      })
      .catch(() => undefined);
  }

  return {
    stop: () => {
      cancelled = true;
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      document.removeEventListener("visibilitychange", vis);
      void wake?.release();
    },
  };
}
