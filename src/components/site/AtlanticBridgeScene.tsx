/**
 * Stylized illustration: Atlantic swell in the foreground, Angus L. Macdonald–style
 * suspension bridge silhouette on the horizon (Halifax Harbour). Decorative only.
 */
export function AtlanticBridgeScene({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 320"
      preserveAspectRatio="xMidYMax meet"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Illustration of Atlantic Ocean waves with a suspension bridge silhouette"
    >
      <title>Atlantic waves and harbour bridge silhouette</title>
      <defs>
        <linearGradient id="atl-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0f9ff" />
          <stop offset="45%" stopColor="#e0f2fe" />
          <stop offset="100%" stopColor="#bae6fd" />
        </linearGradient>
        <linearGradient id="atl-hill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
        <linearGradient id="atl-water-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
        <linearGradient id="atl-water-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#075985" />
        </linearGradient>
        <linearGradient id="atl-water-deep" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#075985" />
          <stop offset="100%" stopColor="#0c4a6e" />
        </linearGradient>
        <filter id="atl-soft" x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.5" />
        </filter>
      </defs>

      <rect width="1200" height="320" fill="url(#atl-sky)" />

      {/* Distant shore / Dartmouth hills */}
      <path
        fill="url(#atl-hill)"
        opacity={0.42}
        d="M0 168 L0 208 L1200 208 L1200 168 L1180 172 L1040 155 L900 175 L760 158 L620 178 L480 162 L340 182 L200 165 L80 175 L0 168 Z"
      />

      {/* Bridge silhouette — suspension towers + deck (Macdonald-style profile) */}
      <g fill="#0f172a">
        <path d="M 298 186 L 902 186 L 902 196 L 298 196 Z" />
        <path d="M 412 196 L 430 88 L 454 88 L 472 196 Z" />
        <path d="M 728 196 L 746 88 L 770 88 L 788 196 Z" />
      </g>
      <path
        fill="none"
        stroke="#0f172a"
        strokeWidth={3}
        strokeLinecap="round"
        d="M 432 92 Q 600 175 768 92"
      />
      <path
        fill="none"
        stroke="#0f172a"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.85}
        d="M 432 102 Q 600 178 768 102"
      />
      {/* Light vertical suspenders */}
      {[380, 410, 440, 470, 500, 530, 560, 590, 620, 650, 680, 710, 740, 770, 800].map((x, i) => (
        <line
          key={x}
          x1={x}
          y1={186}
          x2={x}
          y2={168 + (i % 3) * 2}
          stroke="#0f172a"
          strokeWidth={1.2}
          opacity={0.45}
        />
      ))}

      {/* Water layers — back swell */}
      <path
        fill="url(#atl-water-back)"
        opacity={0.55}
        d="M0 198 C 200 188 400 210 600 198 C 800 186 1000 208 1200 198 L 1200 320 L0 320 Z"
      />

      {/* Mid wave */}
      <path
        fill="url(#atl-water-mid)"
        opacity={0.88}
        d="M0 218 C 180 198 380 232 600 218 C 820 204 1020 228 1200 212 L 1200 320 L0 320 Z"
      />

      {/* Foreground Atlantic swell */}
      <path
        fill="url(#atl-water-deep)"
        d="M0 242 C 220 222 420 258 600 244 C 780 230 980 252 1200 236 L 1200 320 L0 320 Z"
      />

      {/* Foam / crest highlights */}
      <path
        fill="#ffffff"
        opacity={0.22}
        filter="url(#atl-soft)"
        d="M0 248 C 200 232 400 262 600 250 C 800 238 1000 256 1200 242 L 1200 258 C 1000 272 800 254 600 266 C 400 278 200 260 0 272 Z"
      />
      <path
        fill="none"
        stroke="#ffffff"
        strokeWidth={1.5}
        opacity={0.35}
        d="M 40 256 Q 300 238 600 252 T 1160 244"
      />
    </svg>
  );
}
