/**
 * Halifax, NS — local time + Open-Meteo (free, no key) for hero ambience.
 * Coordinates: downtown Halifax.
 */

export const HALIFAX_LAT = 44.6488;
export const HALIFAX_LON = -63.5752;
export const HALIFAX_TZ = "America/Halifax";

export type Ambience = "night" | "dawn" | "day" | "dusk" | "evening";

export type WeatherMood =
  | "clear"
  | "cloud"
  | "rain"
  | "snow"
  | "fog"
  | "storm"
  | "unknown";

export function getHalifaxHour(d: Date): number {
  try {
    const h = new Intl.DateTimeFormat("en-CA", {
      timeZone: HALIFAX_TZ,
      hour: "numeric",
      hour12: false,
      hourCycle: "h23",
    })
      .formatToParts(d)
      .find((p) => p.type === "hour")?.value;
    if (h !== undefined) {
      const n = parseInt(h, 10);
      if (!Number.isNaN(n)) return ((n % 24) + 24) % 24;
    }
  } catch {
    /* fall through */
  }
  return d.getHours();
}

/** Visual bucket from Halifax local hour (approximate sun times vary by season). */
export function getAmbienceFromHour(hour: number): Ambience {
  if (hour >= 22 || hour < 5) return "night";
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "evening";
}

/** WMO Weather interpretation codes (Open-Meteo). */
export function wmoToMood(code: number): WeatherMood {
  if (code === 0) return "clear";
  if (code >= 1 && code <= 3) return "cloud";
  if (code >= 45 && code <= 48) return "fog";
  if (code >= 51 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code >= 95) return "storm";
  return "unknown";
}

export function weatherLabel(code: number): string {
  const m: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Fog",
    51: "Drizzle",
    53: "Drizzle",
    55: "Drizzle",
    61: "Rain",
    63: "Rain",
    65: "Rain",
    71: "Snow",
    73: "Snow",
    75: "Snow",
    80: "Showers",
    81: "Showers",
    82: "Showers",
    95: "Thunderstorm",
    96: "Thunderstorm",
    99: "Thunderstorm",
  };
  return m[code] ?? "Current conditions";
}

export type OpenMeteoCurrent = {
  temperature_2m: number;
  weather_code: number;
  is_day: number;
};

export async function fetchHalifaxWeather(): Promise<OpenMeteoCurrent | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(HALIFAX_LAT));
  url.searchParams.set("longitude", String(HALIFAX_LON));
  url.searchParams.set("current", "temperature_2m,weather_code,is_day");
  url.searchParams.set("timezone", HALIFAX_TZ);

  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = (await res.json()) as { current?: OpenMeteoCurrent };
  return data.current ?? null;
}

export function formatHalifaxTime(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HALIFAX_TZ,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

export type CelestialBody = "sun" | "moon" | "none";

export type HeroPalette = {
  gradient: string;
  orbA: string;
  orbB: string;
  orbC: string;
  topGlow: string;
  vignetteBottom: string;
  waveOpacity: number;
  gridOpacity: number;
  /** Animated Halifax skyline + harbour */
  celestial: CelestialBody;
  skylineSilhouette: string;
  waterSurface: string;
  waterDeep: string;
  windowGlow: string;
  windowGlowOpacity: number;
  cloudOpacity: number;
  starOpacity: number;
  reflectionOpacity: number;
};

/** True when Halifax local hour bucket is night / late twilight (moon + stars). */
function isNightAmbience(ambience: Ambience): boolean {
  return ambience === "night" || ambience === "evening";
}

/**
 * Sun vs moon follows Halifax local time (ambience). Open-Meteo `is_day` can disagree
 * with civil time near dawn/dusk or due to API quirks — local hour is authoritative.
 */
function pickCelestial(ambience: Ambience, apiIsDay: number | null): CelestialBody {
  if (ambience === "dawn" || ambience === "day" || ambience === "dusk") {
    return "sun";
  }
  if (ambience === "night" || ambience === "evening") {
    if (apiIsDay === 1) return "sun";
    return "moon";
  }
  return "none";
}

export function buildHeroPalette(
  ambience: Ambience,
  mood: WeatherMood,
  apiIsDay: number | null,
): HeroPalette {
  const rain = mood === "rain" || mood === "storm";
  const storm = mood === "storm";
  const snow = mood === "snow";
  const fog = mood === "fog";
  const cloudy = mood === "cloud";
  const celestial = pickCelestial(ambience, apiIsDay);

  let orbA = "rgba(0, 180, 216, 0.14)";
  let orbB = "rgba(0, 36, 125, 0.30)";
  let orbC = "rgba(103, 232, 249, 0.07)";
  let topGlow = "rgba(0, 180, 216, 0.12)";
  let vignetteBottom = "rgba(0,0,0,0.5)";
  let waveOpacity = 0.4;
  let gridOpacity = 0.04;

  if (ambience === "day") {
    orbA = "rgba(120, 200, 255, 0.35)";
    orbB = "rgba(40, 120, 200, 0.22)";
    orbC = "rgba(255, 255, 255, 0.2)";
    topGlow = "rgba(255, 255, 255, 0.45)";
    vignetteBottom = "rgba(0,0,0,0.1)";
    gridOpacity = 0.025;
  }

  if (rain && ambience === "day") {
    orbA = "rgba(140, 190, 220, 0.28)";
    orbB = "rgba(60, 120, 170, 0.22)";
    orbC = "rgba(220, 235, 245, 0.12)";
    topGlow = "rgba(180, 210, 235, 0.2)";
    waveOpacity = 0.48;
  } else if (rain) {
    orbA = "rgba(120, 160, 190, 0.18)";
    orbB = "rgba(40, 70, 95, 0.35)";
    orbC = "rgba(180, 200, 220, 0.08)";
    topGlow = "rgba(100, 140, 170, 0.1)";
    waveOpacity = 0.55;
  } else if (snow) {
    orbA = "rgba(200, 230, 255, 0.12)";
    orbB = "rgba(80, 120, 160, 0.25)";
    orbC = "rgba(255, 255, 255, 0.1)";
    topGlow = "rgba(220, 240, 255, 0.15)";
  } else if (fog) {
    orbA = "rgba(140, 160, 175, 0.12)";
    orbB = "rgba(80, 100, 115, 0.22)";
    orbC = "rgba(200, 210, 215, 0.06)";
    topGlow = "rgba(160, 180, 190, 0.08)";
    gridOpacity = 0.025;
  } else if (cloudy) {
    orbA = "rgba(0, 160, 195, 0.1)";
    orbB = "rgba(30, 60, 90, 0.28)";
    waveOpacity = 0.32;
  }

  if (isNightAmbience(ambience)) {
    vignetteBottom = "rgba(0,0,0,0.72)";
    topGlow = "rgba(45, 75, 90, 0.1)";
    waveOpacity *= 0.75;
  }

  const gradients: Record<Ambience, string> = {
    night: `linear-gradient(135deg, #030a08 0%, #081418 22%, #0c1820 48%, #061016 72%, #020508 100%)`,
    dawn: `linear-gradient(135deg, #0a1220 0%, #1a2040 22%, #2c2848 45%, #0f1c28 70%, #060c12 100%)`,
    day: `linear-gradient(180deg, #d8e8f0 0%, #b8d4e8 18%, #8fb8d0 38%, #6a9ab8 58%, #4a7a94 78%, #355a6e 100%)`,
    dusk: `linear-gradient(135deg, #080c14 0%, #1a1828 20%, #2a1f30 42%, #0f1824 68%, #05080e 100%)`,
    evening: `linear-gradient(135deg, #040a0c 0%, #0c1620 28%, #081418 52%, #05080c 100%)`,
  };

  let gradient = gradients[ambience];

  if (rain && ambience !== "day") {
    gradient = `linear-gradient(135deg, #060a10 0%, #0c1822 30%, #142830 60%, #080c12 100%)`;
  } else if (rain && ambience === "day") {
    gradient = `linear-gradient(180deg, #c8d8e4 0%, #a8c4d8 25%, #88a8c0 55%, #5a8098 100%)`;
  } else if (snow) {
    gradient = `linear-gradient(135deg, #0a1018 0%, #12202c 35%, #1a2834 65%, #0c1218 100%)`;
  } else if (fog) {
    gradient = `linear-gradient(135deg, #0c1014 0%, #141a20 40%, #181c22 100%)`;
  }

  if (ambience === "dawn" && rain) {
    gradient = gradients.dawn;
  }

  let skylineSilhouette = "rgba(6, 14, 22, 0.94)";
  let waterSurface = "rgba(0, 95, 118, 0.5)";
  let waterDeep = "rgba(0, 28, 42, 0.92)";
  if (ambience === "day") {
    skylineSilhouette = "rgba(28, 48, 58, 0.88)";
    waterSurface = "rgba(0, 110, 135, 0.42)";
    waterDeep = "rgba(0, 45, 62, 0.85)";
  }
  const windowGlow = "rgba(255, 215, 160, 0.9)";
  let windowGlowOpacity = 0.28;
  let cloudOpacity = cloudy || rain || fog || snow ? 0.48 : 0.22;
  let starOpacity = 0;
  let reflectionOpacity = 0.12;

  if (rain) {
    cloudOpacity = Math.min(0.72, cloudOpacity + 0.15);
    waterSurface = "rgba(55, 85, 100, 0.55)";
    reflectionOpacity = 0.08;
  }
  if (snow) {
    cloudOpacity = Math.min(0.65, cloudOpacity + 0.1);
    waterSurface = "rgba(70, 110, 130, 0.45)";
    skylineSilhouette = "rgba(12, 22, 32, 0.92)";
  }
  if (fog) {
    cloudOpacity = 0.78;
    starOpacity = 0;
    reflectionOpacity = 0.06;
    skylineSilhouette = "rgba(18, 24, 30, 0.88)";
  }

  const nightLike = isNightAmbience(ambience);
  if (nightLike) {
    windowGlowOpacity = ambience === "night" ? 0.56 : 0.4;
    starOpacity =
      fog || rain || snow ? 0.04 : cloudy ? 0.12 : mood === "clear" ? 0.5 : 0.28;
    reflectionOpacity = 0.18;
  } else {
    starOpacity = 0;
    windowGlowOpacity = ambience === "dusk" ? 0.18 : 0.08;
  }

  if (storm) cloudOpacity = Math.max(cloudOpacity, 0.85);

  return {
    gradient,
    orbA,
    orbB,
    orbC,
    topGlow,
    vignetteBottom,
    waveOpacity,
    gridOpacity,
    celestial,
    skylineSilhouette,
    waterSurface,
    waterDeep,
    windowGlow,
    windowGlowOpacity,
    cloudOpacity,
    starOpacity,
    reflectionOpacity,
  };
}
