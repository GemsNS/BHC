/**
 * Map Halifax °C to stack plume visuals — cold air holds more visible moisture;
 * hot days read as lighter, faster-rising haze.
 */
export type StackSmokeParams = {
  puffScale: number;
  opacity: number;
  blurStd: number;
  layers: number;
  durationSec: number;
  spreadX: number;
};

export function smokeParamsFromTemp(tempC: number | null): StackSmokeParams {
  const t = tempC ?? 5;
  const cold = Math.max(0, Math.min(1, (14 - t) / 32));
  const hot = Math.max(0, Math.min(1, (t - 16) / 22));

  return {
    puffScale: 0.72 + cold * 0.38 - hot * 0.12,
    opacity: 0.2 + cold * 0.32 - hot * 0.1,
    blurStd: 5 + cold * 10 + hot * 3,
    layers: Math.max(3, Math.min(6, Math.round(3 + cold * 3))),
    durationSec: Math.max(6, 14 + hot * 5 - cold * 4),
    spreadX: 8 + cold * 14 + hot * 4,
  };
}
