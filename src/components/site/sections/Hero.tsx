"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { HalifaxSkylineBackdrop } from "@/components/site/HalifaxSkylineBackdrop";
import { easeArchitectural } from "@/components/site/motion/easing";
import { useHalifaxAmbient } from "@/hooks/useHalifaxAmbient";
import { usePrefersReducedMotion } from "@/components/site/motion/usePrefersReducedMotion";
import type { ProjectAudience } from "@/lib/site/audience";

const stagger = 0.08;

const heroCopy: Record<
  ProjectAudience,
  { headline: string; sub: string; primaryCta: string; secondaryCta: string; tertiary: string }
> = {
  residential: {
    headline: "Precision in every build.",
    sub: "Modern design and uncompromising craftsmanship for homes on the Atlantic—delivered with the clarity and accountability you expect from a full-service partner.",
    primaryCta: "Exterior designer",
    secondaryCta: "Request a consultation",
    tertiary: "View capabilities",
  },
  commercial: {
    headline: "Exteriors that keep buildings working.",
    sub: "Envelope upgrades, openings, and durable cladding for Nova Scotia commercial property—planned for access, safety, and minimal disruption to operations.",
    primaryCta: "Scope your exterior",
    secondaryCta: "Discuss your project",
    tertiary: "Capabilities",
  },
};

export type HeroProps = {
  audience: ProjectAudience;
};

/**
 * Hero — animated Halifax harbour skyline, sky, and water driven by local time + Open-Meteo.
 */
export function Hero({ audience }: HeroProps) {
  const reduce = usePrefersReducedMotion();
  const {
    timeLabel,
    tempC,
    weatherLabelText,
    palette,
    loading,
    weatherError,
    ambience,
    weatherMood,
  } = useHalifaxAmbient();

  const item = reduce
    ? {
        hidden: { opacity: 1, y: 0 },
        show: { opacity: 1, y: 0, transition: { duration: 0 } },
      }
    : {
        hidden: { opacity: 0, y: 18 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.55, ease: easeArchitectural },
        },
      };

  const statusLine = [
    "Halifax",
    timeLabel,
    tempC !== null ? `${tempC}°C` : loading ? "…" : "—",
    weatherError ? "Weather unavailable" : weatherLabelText,
  ].join(" · ");

  const copy = heroCopy[audience];
  const showcaseHref = `/showcase?audience=${audience}`;

  return (
    <section
      className="relative min-h-[100dvh] overflow-x-hidden"
      style={{ background: palette.gradient }}
    >
      <HalifaxSkylineBackdrop
        palette={palette}
        ambience={ambience}
        weatherMood={weatherMood}
        reduce={reduce}
        tempC={tempC}
      />

      <div className="relative z-10 flex min-h-[100dvh] flex-col justify-end px-4 pb-16 pt-28 sm:px-6 sm:pb-20 sm:pt-32 lg:px-8 lg:pb-24">
        <div className="mx-auto w-full max-w-7xl">
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              show: {
                transition: reduce
                  ? { staggerChildren: 0 }
                  : { staggerChildren: stagger, delayChildren: 0.06 },
              },
            }}
            className="max-w-3xl"
          >
            <motion.p
              variants={item}
              className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua"
            >
              Halifax &amp; coastal Nova Scotia
            </motion.p>
            <motion.p
              variants={item}
              className="mt-2 max-w-2xl text-[13px] leading-snug text-white/70 sm:text-sm"
              aria-live="polite"
            >
              {statusLine}
            </motion.p>
            <motion.h1
              variants={item}
              className="mt-4 text-display font-bold text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.35)]"
            >
              {copy.headline}
            </motion.h1>
            <motion.p
              variants={item}
              className="mt-5 max-w-xl text-lg leading-relaxed text-white/90 sm:text-xl"
            >
              {copy.sub}
            </motion.p>

            <motion.div
              variants={item}
              className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4"
            >
              <Link
                href="#exterior-design"
                className="inline-flex items-center justify-center rounded-sm bg-primary-aqua px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-black/25 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-xl"
              >
                {copy.primaryCta}
              </Link>
              <Link
                href="#contact"
                className="inline-flex items-center justify-center rounded-sm border border-white/50 bg-black/35 px-7 py-3.5 text-base font-semibold text-white shadow-sm backdrop-blur-sm transition-[transform,background-color] duration-300 hover:bg-black/50"
              >
                {copy.secondaryCta}
              </Link>
              <Link
                href="#services"
                className="inline-flex items-center justify-center text-sm font-semibold text-white underline-offset-4 transition-colors hover:text-primary-aqua hover:underline"
              >
                {copy.tertiary}
              </Link>
              <Link
                href={showcaseHref}
                className="inline-flex items-center justify-center rounded-sm border border-white/40 bg-black/30 px-7 py-3.5 text-base font-semibold text-white transition-[transform,background-color] duration-300 hover:border-primary-aqua/60 hover:bg-black/45"
              >
                Full showcase
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
