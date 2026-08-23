"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildHeroPalette,
  fetchHalifaxWeather,
  formatHalifaxTime,
  getAmbienceFromHour,
  getHalifaxHour,
  type HeroPalette,
  weatherLabel,
  wmoToMood,
  type WeatherMood,
} from "@/lib/site/halifaxAmbient";

const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const CLOCK_TICK_MS = 30 * 1000;

export type HalifaxAmbientState = {
  timeLabel: string;
  ambience: ReturnType<typeof getAmbienceFromHour>;
  weatherMood: WeatherMood;
  weatherLabelText: string;
  tempC: number | null;
  isDay: number | null;
  palette: HeroPalette;
  loading: boolean;
  weatherError: boolean;
};

export function useHalifaxAmbient(): HalifaxAmbientState {
  /** False during SSR / static pre-render — `Date` there is build time (e.g. GitHub Actions), not the visitor. */
  const [clientReady, setClientReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [weather, setWeather] = useState<{
    tempC: number;
    code: number;
    isDay: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [weatherError, setWeatherError] = useState(false);

  const loadWeather = useCallback(async () => {
    try {
      const cur = await fetchHalifaxWeather();
      if (!cur) {
        setWeatherError(true);
        return;
      }
      setWeatherError(false);
      setWeather({
        tempC: Math.round(cur.temperature_2m * 10) / 10,
        code: cur.weather_code,
        isDay: cur.is_day,
      });
    } catch {
      setWeatherError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setClientReady(true);
  }, []);

  useEffect(() => {
    loadWeather();
    const w = window.setInterval(loadWeather, WEATHER_REFRESH_MS);
    return () => window.clearInterval(w);
  }, [loadWeather]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const now = useMemo(() => new Date(), [tick]);
  const hour = clientReady ? getHalifaxHour(now) : 12;
  const hourAmbience = clientReady ? getAmbienceFromHour(hour) : "day";
  /** Open-Meteo solar flag for Halifax — if hour math is wrong on a device, is_day=1 still means daylight. */
  const ambience =
    clientReady && weather?.isDay === 1 && (hourAmbience === "night" || hourAmbience === "evening")
      ? "day"
      : hourAmbience;
  const weatherMood = weather ? wmoToMood(weather.code) : "unknown";
  const weatherLabelText = weather ? weatherLabel(weather.code) : "Weather unavailable";

  const palette = useMemo(
    () =>
      buildHeroPalette(ambience, weatherMood, weather?.isDay ?? null),
    [ambience, weatherMood, weather?.isDay],
  );

  const timeLabel = clientReady ? formatHalifaxTime(now) : "…";

  return {
    timeLabel,
    ambience,
    weatherMood,
    weatherLabelText,
    tempC: weather?.tempC ?? null,
    isDay: weather?.isDay ?? null,
    palette,
    loading,
    weatherError,
  };
}
