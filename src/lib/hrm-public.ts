/**
 * Public APIs for Halifax Regional Municipality context.
 * Open-Meteo (weather) + OpenStreetMap Nominatim (geocoding).
 */

export const HRM_LAT = 44.6488;
export const HRM_LON = -63.5752;

export type HrmWeather = {
  source: "open-meteo";
  latitude: number;
  longitude: number;
  temperatureC: number | null;
  precipitationMm: number | null;
  windKmh: number | null;
  weatherCode: number | null;
  summary: string;
  fetchedAt: string;
};

export type GeocodeResult = {
  displayName: string;
  lat: number;
  lon: number;
  city: string;
  province: string;
  country: string;
};

const WEATHER_CODES: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  61: "Light rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Moderate snow",
  80: "Rain showers",
  95: "Thunderstorm",
};

export async function fetchHrmWeather(): Promise<HrmWeather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${HRM_LAT}&longitude=${HRM_LON}` +
    `&current=temperature_2m,precipitation,wind_speed_10m,weather_code&timezone=America%2FHalifax`;
  const res = await fetch(url, { next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`Open-Meteo failed (${res.status})`);
  const json = (await res.json()) as {
    current?: {
      temperature_2m?: number;
      precipitation?: number;
      wind_speed_10m?: number;
      weather_code?: number;
    };
  };
  const c = json.current ?? {};
  const code = c.weather_code ?? null;
  return {
    source: "open-meteo",
    latitude: HRM_LAT,
    longitude: HRM_LON,
    temperatureC: c.temperature_2m ?? null,
    precipitationMm: c.precipitation ?? null,
    windKmh: c.wind_speed_10m ?? null,
    weatherCode: code,
    summary: code != null ? (WEATHER_CODES[code] ?? `Code ${code}`) : "Unknown",
    fetchedAt: new Date().toISOString(),
  };
}

export async function geocodeNovaScotia(query: string): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({
    q: `${q}, Nova Scotia, Canada`,
    format: "json",
    limit: "5",
    countrycodes: "ca",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      "User-Agent": "BHContracting-BHC-CRM/1.0 (ops@bhcontracting.co)",
      Accept: "application/json",
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Nominatim failed (${res.status})`);
  const rows = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
    address?: { city?: string; town?: string; municipality?: string; state?: string; country?: string };
  }>;
  return rows.map((r) => ({
    displayName: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
    city:
      r.address?.city ??
      r.address?.town ??
      r.address?.municipality ??
      "Halifax",
    province: r.address?.state ?? "Nova Scotia",
    country: r.address?.country ?? "Canada",
  }));
}

export async function buildHrmContextSummary(): Promise<string> {
  const weather = await fetchHrmWeather();
  return (
    `HRM weather (Open-Meteo): ${weather.summary}, ${weather.temperatureC ?? "?"}°C, ` +
    `wind ${weather.windKmh ?? "?"} km/h, precip ${weather.precipitationMm ?? 0} mm. ` +
    `Map center ${HRM_LAT}, ${HRM_LON}.`
  );
}
