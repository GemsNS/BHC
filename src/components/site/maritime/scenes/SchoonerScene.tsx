/** Bluenose-inspired schooner silhouette at dusk. Decorative. */
export function SchoonerScene({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 320"
      preserveAspectRatio="xMidYMax meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Illustration of a schooner under sail on the ocean"
    >
      <title>Schooner and evening sea</title>
      <defs>
        <linearGradient id="sch-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="55%" stopColor="#3d5a80" />
          <stop offset="100%" stopColor="#7dd3fc" />
        </linearGradient>
        <linearGradient id="sch-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#075985" />
          <stop offset="100%" stopColor="#082f49" />
        </linearGradient>
      </defs>
      <rect width="1200" height="320" fill="url(#sch-sky)" />
      <circle cx="980" cy="70" r="36" fill="#fde68a" opacity={0.35} />
      {/* Hull + masts + sails simplified */}
      <g fill="#0f172a">
        <path d="M 380 215 L 820 215 L 800 248 L 400 248 Z" />
        <path d="M 520 215 L 520 95 L 535 95 L 535 215 Z" />
        <path d="M 620 215 L 620 88 L 635 88 L 635 215 Z" />
        <path d="M 535 100 L 620 130 L 535 155 Z" fill="#1e293b" opacity={0.95} />
        <path d="M 620 95 L 720 125 L 620 148 Z" fill="#1e293b" opacity={0.95} />
        <path d="M 535 115 L 480 200 L 535 200 Z" fill="#1e293b" opacity={0.9} />
      </g>
      <path
        fill="url(#sch-water)"
        opacity={0.9}
        d="M0 225 C 200 208 400 238 600 225 C 800 212 1000 232 1200 218 L1200 320 L0 320 Z"
      />
      <path
        fill="#0c4a6e"
        d="M0 245 C 220 230 420 255 600 243 C 780 231 980 250 1200 236 L1200 320 L0 320 Z"
      />
      <path
        fill="none"
        stroke="#38bdf8"
        strokeWidth={1}
        opacity={0.15}
        d="M 0 258 Q 400 240 800 252 T 1200 248"
      />
    </svg>
  );
}
