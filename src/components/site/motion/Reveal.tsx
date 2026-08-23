"use client";

import { motion } from "framer-motion";
import { easeArchitectural } from "@/components/site/motion/easing";
import { usePrefersReducedMotion } from "@/components/site/motion/usePrefersReducedMotion";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Extra delay in seconds (staggered grids) */
  delay?: number;
  /** Initial Y offset in px — keeps opacity 1 for hydration safety */
  y?: number;
};

export function Reveal({ children, className, delay = 0, y = 32 }: RevealProps) {
  const reduce = usePrefersReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 1, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px -14% 0px", amount: 0.12 }}
      transition={{
        duration: 0.78,
        ease: easeArchitectural,
        delay,
      }}
    >
      {children}
    </motion.div>
  );
}
