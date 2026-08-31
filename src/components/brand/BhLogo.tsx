import Image from "next/image";
import { withBasePath } from "@/lib/paths";

type BhLogoProps = {
  className?: string;
  priority?: boolean;
  width?: number;
  height?: number;
};

/** Official BH Contracting LTD. lockup (user-provided asset) */
export function BhLogo({
  className = "h-11 w-auto max-w-[200px] object-contain object-left sm:h-12",
  priority = false,
  width = 200,
  height = 56,
}: BhLogoProps) {
  return (
    <Image
      src={withBasePath("/brand/bh-contracting-ltd.png")}
      alt="BH Contracting LTD."
      width={width}
      height={height}
      className={className}
      priority={priority}
      unoptimized
    />
  );
}
