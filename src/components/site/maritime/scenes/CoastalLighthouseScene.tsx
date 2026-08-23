/** Stylized Peggy’s Cove–style lighthouse on rocks, Atlantic swell. Decorative. */
export function CoastalLighthouseScene({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 320"
      preserveAspectRatio="xMidYMax meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Illustration of a coastal lighthouse and ocean waves"
    >
      <title>Coastal lighthouse and waves</title>
      <defs>
        <linearGradient id="lh-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8f4fc" />
          <stop offset="55%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
        <linearGradient id="lh-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0369a1" />
          <stop offset="100%" stopColor="#0c4a6e" />
        </linearGradient>
        <linearGradient id="lh-rock" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
      </defs>
      <rect width="1200" height="320" fill="url(#lh-sky)" />
      <path
        fill="#64748b"
        opacity={0.35}
        d="M0 150 L200 130 L400 155 L600 125 L800 148 L1000 132 L1200 150 L1200 320 L0 320 Z"
      />
      {/* Rocks */}
      <path
        fill="url(#lh-rock)"
        d="M0 220 L120 200 L280 235 L420 195 L520 225 L680 200 L820 230 L950 210 L1080 240 L1200 215 L1200 320 L0 320 Z"
      />
      {/* Lighthouse */}
      <g transform="translate(520 95)">
        <rect x="68" y="0" width="44" height="125" rx="4" fill="#f8fafc" stroke="#0f172a" strokeWidth="3" />
        <rect x="76" y="18" width="28" height="10" fill="#dc2626" />
        <rect x="76" y="42" width="28" height="10" fill="#dc2626" />
        <rect x="76" y="66" width="28" height="10" fill="#dc2626" />
        <polygon points="72,0 108,0 90,-28" fill="#0f172a" />
        <circle cx="90" cy="-12" r="8" fill="#fef08a" opacity={0.9} />
      </g>
      <path
        fill="url(#lh-water)"
        opacity={0.92}
        d="M0 235 C 200 215 400 250 600 238 C 800 226 1000 248 1200 232 L1200 320 L0 320 Z"
      />
      <path
        fill="#075985"
        d="M0 255 C 220 238 420 268 600 256 C 780 244 980 262 1200 248 L1200 320 L0 320 Z"
      />
      <path
        fill="none"
        stroke="#ffffff"
        strokeWidth={1.2}
        opacity={0.25}
        d="M 20 262 Q 400 248 800 258 T 1180 252"
      />
    </svg>
  );
}
