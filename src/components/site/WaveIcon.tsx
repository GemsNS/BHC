import type { LucideIcon } from "lucide-react";

/**
 * Lucide icon with a small coastal wave accent (bottom-right), per brand asset sheet.
 */
export function WaveIcon({
  icon: Icon,
  className,
  "aria-hidden": ariaHidden = true,
}: {
  icon: LucideIcon;
  className?: string;
  "aria-hidden"?: boolean;
}) {
  return (
    <span className={`relative inline-flex ${className ?? ""}`}>
      <Icon className="h-8 w-8 text-primary-aqua" strokeWidth={1.5} aria-hidden={ariaHidden} />
      <svg
        className="pointer-events-none absolute -bottom-0.5 -right-1 h-2.5 w-7 text-primary-aqua"
        viewBox="0 0 28 10"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M1 7 Q 7 2 14 7 T 27 7"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
