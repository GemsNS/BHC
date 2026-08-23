/** Inshore fishing boat silhouette — Maritimes / Northumberland Strait vibe. Decorative. */
export function FishingBoatScene({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 320"
      preserveAspectRatio="xMidYMax meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Illustration of a fishing boat on ocean waves"
    >
      <title>Fishing boat and Atlantic swell</title>
      <defs>
        <linearGradient id="fb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0f9ff" />
          <stop offset="100%" stopColor="#bae6fd" />
        </linearGradient>
        <linearGradient id="fb-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#0c4a6e" />
        </linearGradient>
      </defs>
      <rect width="1200" height="320" fill="url(#fb-sky)" />
      <path
        fill="#94a3b8"
        opacity={0.3}
        d="M0 175 L300 155 L600 178 L900 160 L1200 172 L1200 320 L0 320 Z"
      />
      {/* Boat silhouette */}
      <g fill="#0f172a" transform="translate(0 8)">
        <path d="M 420 198 L 780 198 L 760 228 L 440 228 Z" />
        <rect x="520" y="168" width="120" height="32" rx="3" />
        <path d="M 580 168 L 580 128 L 600 128 L 600 168 Z" />
        <line x1="580" y1="128" x2="580" y2="108" stroke="#0f172a" strokeWidth="4" />
        <path d="M 460 198 Q 600 185 700 198" fill="none" stroke="#0f172a" strokeWidth="3" />
        <circle cx="600" cy="115" r="6" fill="#0f172a" />
      </g>
      <path
        fill="url(#fb-water)"
        opacity={0.85}
        d="M0 210 C 180 195 380 225 600 212 C 820 199 1020 218 1200 205 L1200 320 L0 320 Z"
      />
      <path
        fill="#075985"
        d="M0 232 C 200 218 400 245 600 232 C 800 219 1000 238 1200 225 L1200 320 L0 320 Z"
      />
      <path
        fill="#0c4a6e"
        d="M0 252 C 220 238 420 262 600 250 C 780 238 980 255 1200 242 L1200 320 L0 320 Z"
      />
      <path
        fill="none"
        stroke="#ffffff"
        strokeWidth={1.5}
        opacity={0.2}
        d="M 0 248 Q 300 232 600 246 T 1200 240"
      />
    </svg>
  );
}
