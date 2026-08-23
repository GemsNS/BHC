/**
 * Nova Scotia flag — white field with blue saltire (St Andrew’s Cross).
 * Proportions simplified for small UI; escutcheon omitted at tiny sizes for clarity.
 */
export function NovaScotiaFlag({
  className,
  size = 24,
}: {
  className?: string;
  /** Approximate height in px; width follows 3:2 ratio */
  size?: number;
}) {
  const h = size;
  const w = (size * 3) / 2;
  return (
    <svg
      role="img"
      aria-label="Nova Scotia flag"
      viewBox="0 0 90 60"
      width={w}
      height={h}
      className={className}
    >
      <rect width="90" height="60" fill="#ffffff" />
      <g fill="var(--ns-saltire-blue, #00247d)">
        <g transform="translate(45 30) rotate(33.69)">
          <rect x="-58" y="-6" width="116" height="12" />
        </g>
        <g transform="translate(45 30) rotate(-33.69)">
          <rect x="-58" y="-6" width="116" height="12" />
        </g>
      </g>
    </svg>
  );
}
