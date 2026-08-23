"use client";

import { useId } from "react";
import { smokeParamsFromTemp } from "@/lib/site/smokeFromTemp";

type Props = {
  waterBand: string;
  motion: boolean;
  fog: boolean;
  rain: boolean;
  tempC: number | null;
  reduceMotion: boolean;
};

/** More accurate Tufts Cove + Macdonald profile (stacks taller than tower). */
export function HarbourBridgeStacks({
  waterBand,
  motion,
  fog,
  rain,
  tempC,
  reduceMotion,
}: Props) {
  const stripeId = useId().replace(/:/g, "");
  const stackShadeId = useId().replace(/:/g, "");
  const bridgeTowerId = useId().replace(/:/g, "");
  const smokeBlurId = useId().replace(/:/g, "");
  const hazeId = useId().replace(/:/g, "");

  const smoke = smokeParamsFromTemp(tempC);
  const layerOpacity = fog ? 0.5 : rain ? 0.56 : 0.72;

  const stackBaseY = 334;
  const stacks: { cx: number; w: number; h: number }[] = [
    { cx: 264, w: 30, h: 232 },
    { cx: 304, w: 30, h: 246 },
    { cx: 344, w: 30, h: 236 },
  ];

  const deckY = 262;
  const towerX = 926;
  const towerTop = 112;
  const towerBottom = 332;

  return (
    <div
      className={`pointer-events-none absolute left-0 z-0 w-full overflow-visible ${
        motion && !reduceMotion ? "hero-harbour-drift" : ""
      }`}
      style={{
        bottom: waterBand,
        height: "min(56vh, 470px)",
        opacity: layerOpacity,
      }}
    >
      <svg className="h-full w-full" viewBox="0 0 1200 470" preserveAspectRatio="none" aria-hidden>
        <defs>
          <pattern id={stripeId} patternUnits="userSpaceOnUse" width="24" height="18">
            <rect width="24" height="9" fill="#f5f5f5" />
            <rect y="9" width="24" height="9" fill="#d22b2b" />
          </pattern>
          <linearGradient id={stackShadeId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(10,20,28,0.14)" />
            <stop offset="45%" stopColor="rgba(10,20,28,0.0)" />
            <stop offset="100%" stopColor="rgba(10,20,28,0.24)" />
          </linearGradient>
          <linearGradient id={bridgeTowerId} gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4f6657" />
            <stop offset="55%" stopColor="#6e866f" />
            <stop offset="100%" stopColor="#425a4c" />
          </linearGradient>
          <linearGradient id={hazeId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(180,196,212,0.32)" />
            <stop offset="100%" stopColor="rgba(180,196,212,0)" />
          </linearGradient>
          <filter id={smokeBlurId} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={smoke.blurStd} result="b" />
          </filter>
        </defs>

        <rect x="0" y="0" width="1200" height="180" fill={`url(#${hazeId})`} />
        <path
          d="M0 334 L0 300 L70 294 L140 304 L210 294 L300 302 L390 290 L520 300 L640 290 L760 300 L920 292 L1050 300 L1200 296 L1200 334 Z"
          fill="#223341"
          opacity="0.48"
        />

        {stacks.map(({ cx, w, h }, idx) => {
          const x = cx - w / 2;
          const y = stackBaseY - h;
          return (
            <g key={`stack-${idx}`}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx="1"
                fill={`url(#${stripeId})`}
                stroke="rgba(15,23,42,0.55)"
                strokeWidth="1.1"
              />
              <rect x={x} y={y} width={w} height={h} fill={`url(#${stackShadeId})`} />
            </g>
          );
        })}

        {stacks.map(({ cx, h }, sIdx) => {
          const topY = stackBaseY - h;
          const layers = smoke.layers;
          return (
            <g key={`smoke-${sIdx}`} filter={`url(#${smokeBlurId})`} opacity={smoke.opacity}>
              {Array.from({ length: layers }).map((_, i) => {
                const s = smoke.puffScale * (1 + i * 0.22);
                const ox = (i % 2 === 0 ? 1 : -1) * (4 + i * 3);
                return (
                  <ellipse
                    key={i}
                    className={motion && !reduceMotion ? "hero-smoke-puff" : undefined}
                    cx={cx + ox + 2}
                    cy={topY - 10 - i * 34 * smoke.puffScale}
                    rx={18 * s}
                    ry={13 * s}
                    fill="rgba(226,232,240,0.86)"
                    style={{
                      animationDelay: `${i * 0.55 + sIdx * 0.3}s`,
                      animationDuration: `${smoke.durationSec}s`,
                    }}
                  />
                );
              })}
            </g>
          );
        })}

        {/* Plant mass at left */}
        <rect x="168" y="300" width="232" height="38" fill="#2b3f4d" opacity="0.7" />
        <rect x="198" y="276" width="164" height="26" fill="#415a6b" opacity="0.58" />

        {/* Bridge deck and truss */}
        <path d={`M 0 ${deckY} L 1200 ${deckY - 3} L 1200 ${deckY + 12} L 0 ${deckY + 16} Z`} fill="#2d3f36" opacity="0.92" />
        <rect x="0" y={deckY + 15} width="1200" height="8" fill="#1d2a24" opacity="0.76" />
        {Array.from({ length: 55 }).map((_, i) => (
          <line
            key={`truss-${i}`}
            x1={i * 22}
            y1={deckY + 15}
            x2={i * 22 + 12}
            y2={deckY + 23}
            stroke="#4d6658"
            strokeWidth="0.8"
            opacity="0.48"
          />
        ))}

        {/* Main visible tower (right side in reference perspective) */}
        <rect x={towerX - 28} y={towerTop} width="56" height={towerBottom - towerTop} fill={`url(#${bridgeTowerId})`} />
        <path d={`M ${towerX - 20} ${towerTop + 8} L ${towerX + 20} ${towerTop + 8} M ${towerX - 20} ${towerTop + 50} L ${towerX + 20} ${towerTop + 50} M ${towerX - 20} ${towerTop + 92} L ${towerX + 20} ${towerTop + 92} M ${towerX - 20} ${towerTop + 134} L ${towerX + 20} ${towerTop + 134}`} stroke="#3e5548" strokeWidth="3.2" opacity="0.6" />
        <path d={`M ${towerX - 24} ${towerTop + 10} L ${towerX + 24} ${towerBottom - 8} M ${towerX + 24} ${towerTop + 10} L ${towerX - 24} ${towerBottom - 8}`} stroke="#3c5245" strokeWidth="2.3" opacity="0.45" />

        {/* Main cable profile (subtle steel color, no neon/gold) */}
        <path
          d={`M 34 ${deckY - 14} Q ${towerX - 210} ${deckY - 84} ${towerX} ${towerTop + 4} Q ${towerX + 120} ${deckY - 70} 1190 ${deckY - 16}`}
          fill="none"
          stroke="#7f8f88"
          strokeWidth="3.2"
          opacity="0.85"
        />
        <path
          d={`M 44 ${deckY - 9} Q ${towerX - 210} ${deckY - 76} ${towerX} ${towerTop + 12} Q ${towerX + 118} ${deckY - 63} 1188 ${deckY - 12}`}
          fill="none"
          stroke="#5d6e66"
          strokeWidth="1.8"
          opacity="0.6"
        />

        {/* Suspenders */}
        {Array.from({ length: 34 }).map((_, i) => {
          const x = 92 + i * 32;
          const t = x / 1200;
          const cableY = deckY - 18 - 72 * Math.sin(Math.PI * t * 0.86);
          return (
            <line
              key={`hanger-${i}`}
              x1={x}
              y1={Math.max(cableY, towerTop + 6)}
              x2={x}
              y2={deckY + 1}
              stroke="#6a7972"
              strokeWidth="0.95"
              opacity="0.56"
            />
          );
        })}
      </svg>
    </div>
  );
}
