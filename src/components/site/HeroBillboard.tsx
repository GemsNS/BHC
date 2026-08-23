"use client";

import { useId } from "react";

type Props = {
  motion: boolean;
  /** Harbour line offset (matches skyline base) — barge sits on the water/skyline horizon */
  waterBand: string;
};

/**
 * Billboard on a harbour barge — right-half harbour placement, base on the horizon, nav lights.
 */
export function HeroBillboard({ motion, waterBand }: Props) {
  const shadowId = useId().replace(/:/g, "");

  return (
    <div
      className="pointer-events-none absolute z-[4] hidden w-[min(88vw,300px)] max-w-[300px] md:block"
      style={{
        left: "75%",
        bottom: waterBand,
        transform: "translateX(-50%)",
        opacity: 1,
      }}
    >
      <div className={`h-[min(30vh,260px)] ${motion ? "hero-barge-float" : ""}`}>
        <svg
          viewBox="0 0 800 620"
          className="h-full w-full drop-shadow-[0_12px_36px_rgba(0,0,0,0.55)]"
          preserveAspectRatio="xMidYMax meet"
          aria-hidden
        >
          <defs>
            <filter id={shadowId} x="-8%" y="-8%" width="120%" height="120%">
              <feDropShadow
                dx="2"
                dy="8"
                stdDeviation="9"
                floodColor="#000000"
                floodOpacity="0.45"
              />
            </filter>
          </defs>

          {/* Barge hull (in the water) */}
          <path
            d="M 0 620 L 800 620 L 785 575 L 15 575 Z"
            fill="#0f172a"
            stroke="#1e293b"
            strokeWidth="2"
          />
          <path
            d="M 20 575 L 780 575 L 770 548 L 30 548 Z"
            fill="#1e293b"
            opacity="0.92"
          />
          <rect x="24" y="528" width="752" height="22" rx="3" fill="#334155" stroke="#475569" strokeWidth="1" />

          {/* Short pylons from deck to billboard crossbeams */}
          <rect x="220" y="420" width="40" height="120" fill="#121212" />
          <rect x="210" y="528" width="60" height="22" fill="#121212" rx="3" />
          <rect x="540" y="420" width="40" height="120" fill="#121212" />
          <rect x="530" y="528" width="60" height="22" fill="#121212" rx="3" />

          <rect x="180" y="380" width="440" height="15" fill="#121212" opacity="0.95" />
          <rect x="180" y="250" width="440" height="15" fill="#121212" opacity="0.95" />

          <rect
            x="50"
            y="100"
            width="700"
            height="340"
            rx="12"
            fill="#f8f9fa"
            filter={`url(#${shadowId})`}
          />
          <rect x="60" y="110" width="680" height="320" rx="4" fill="#ffffff" />

          <g>
            <rect x="65" y="115" width="670" height="310" fill="#121212" />

            <g transform="translate(92, 158) scale(0.94)">
              <polygon points="65,0 130,55 0,55" fill="#00b4d8" />
              <rect x="95" y="10" width="15" height="25" fill="#ffffff" />
              <rect x="15" y="55" width="100" height="65" fill="#ffffff" />
              <rect x="35" y="75" width="20" height="20" fill="#121212" />
              <rect x="75" y="75" width="20" height="20" fill="#121212" />
              <path
                d="M -20 130 Q 30 100, 80 130 T 170 130 L 170 160 L -20 160 Z"
                fill="#00b4d8"
              />
              <path
                d="M -20 145 Q 30 115, 80 145 T 170 145 L 170 160 L -20 160 Z"
                fill="#ffffff"
                opacity="0.2"
              />
            </g>

            <text
              x="498"
              y="198"
              textAnchor="middle"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontSize="58"
              fontWeight="900"
              fill="#ffffff"
              letterSpacing="0.04em"
              textLength="430"
              lengthAdjust="spacing"
            >
              SEASIDE
            </text>
            <text
              x="498"
              y="244"
              textAnchor="middle"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontSize="31"
              fontWeight="800"
              fill="#00b4d8"
              textLength="430"
              lengthAdjust="spacing"
            >
              CONTRACTING
            </text>

            <text
              x="498"
              y="282"
              textAnchor="middle"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontSize="18"
              fontWeight="400"
              fill="#f8f9fa"
              fontStyle="italic"
              textLength="400"
              lengthAdjust="spacing"
            >
              Precision in Every Build
            </text>

            <rect x="278" y="296" width="432" height="46" rx="5" fill="#00b4d8" />
            <text
              x="494"
              y="328"
              textAnchor="middle"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontSize="23"
              fontWeight="700"
              fill="#121212"
            >
              (902) 809-9412
            </text>

            <text
              x="498"
              y="384"
              textAnchor="middle"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontSize="15"
              fontWeight="700"
              fill="#00b4d8"
              textLength="400"
              lengthAdjust="spacing"
            >
              www.bhcontracting.co
            </text>
          </g>

          {/* Nav lights: port red, starboard green, masthead white (twinkle via CSS) */}
          <g style={{ filter: "drop-shadow(0 0 4px rgba(255,255,255,0.35))" }}>
            <circle
              className="hero-nav-light hero-nav-light-red"
              cx="88"
              cy="538"
              r="8"
              fill="#f87171"
            />
            <circle
              className="hero-nav-light hero-nav-light-green"
              cx="712"
              cy="538"
              r="8"
              fill="#4ade80"
            />
            <circle
              className="hero-nav-light hero-nav-light-white"
              cx="400"
              cy="92"
              r="5"
              fill="#f8fafc"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
