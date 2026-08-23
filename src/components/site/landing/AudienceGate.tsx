"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Building2, Home } from "lucide-react";
import { easeArchitectural } from "@/components/site/motion/easing";
import { usePrefersReducedMotion } from "@/components/site/motion/usePrefersReducedMotion";
import { withBasePath } from "@/lib/site/withBasePath";

const panelBase =
  "group relative flex min-h-[42vh] flex-1 flex-col justify-end overflow-hidden border border-white/10 bg-zinc-950 px-8 py-12 transition-[transform,box-shadow] duration-500 ease-out sm:min-h-[50vh] md:px-12 md:py-16 lg:min-h-0 lg:py-24";

export function AudienceGate() {
  const reduce = usePrefersReducedMotion();

  return (
    <section
      className="relative min-h-[100dvh] overflow-hidden bg-zinc-950"
      aria-labelledby="audience-gate-heading"
    >
      <div className="pointer-events-none absolute inset-0">
        <Image
          src={withBasePath("/brand/bh-logo-dark.svg")}
          alt=""
          width={480}
          height={140}
          className="absolute left-1/2 top-[14%] h-12 w-auto -translate-x-1/2 opacity-[0.07] sm:top-[12%] sm:h-16"
          aria-hidden
          unoptimized
        />
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(45,212,191,0.12),transparent_55%)]"
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/40 via-transparent to-zinc-950" aria-hidden />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-7xl flex-col px-4 pb-10 pt-28 sm:px-6 sm:pb-14 sm:pt-32 lg:px-8 lg:pb-16 lg:pt-36">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary-aqua">
            BH Contracting Co.
          </p>
          <h1
            id="audience-gate-heading"
            className="mt-5 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[2.65rem] lg:leading-tight"
          >
            Choose how we can help
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-sm leading-relaxed text-zinc-400 sm:text-base">
            Halifax and coastal Nova Scotia—two dedicated paths so we can speak your language from the
            first click: homes and living spaces, or commercial buildings and portfolios.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary-aqua/45 bg-primary-aqua/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-aqua transition-colors hover:bg-primary-aqua/20"
          >
            Staff login
          </Link>
        </header>

        <div className="mt-12 flex flex-1 flex-col gap-4 lg:mt-16 lg:flex-row lg:gap-0">
          <motion.div
            className="flex flex-1"
            initial={reduce ? false : { opacity: 0, x: -28 }}
            animate={reduce ? undefined : { opacity: 1, x: 0 }}
            transition={{ duration: 0.65, ease: easeArchitectural, delay: 0.05 }}
          >
            <Link
              href="/residential"
              className={`${panelBase} rounded-sm lg:rounded-l-sm lg:rounded-r-none hover:z-[1] hover:shadow-[0_24px_80px_-24px_rgba(45,212,191,0.35)] focus-visible:z-[1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-aqua`}
            >
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-teal-950/80 via-zinc-950/20 to-zinc-950 opacity-90 transition-opacity duration-500 group-hover:opacity-100"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -right-12 top-1/4 h-48 w-48 rounded-full bg-primary-aqua/15 blur-3xl transition-all duration-700 group-hover:bg-primary-aqua/25"
                aria-hidden
              />
              <div className="relative z-10 max-w-md">
                <span className="inline-flex rounded-full border border-white/15 bg-white/5 p-3 text-primary-aqua backdrop-blur-sm">
                  <Home className="h-7 w-7" strokeWidth={1.75} aria-hidden />
                </span>
                <h2 className="mt-8 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Residential
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-zinc-400 sm:text-base">
                  Renovations, custom exteriors, decks, and detail-driven envelope work for homeowners who
                  want coastal-durable results and clear communication.
                </p>
                <span className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-primary-aqua">
                  Enter residential experience
                  <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </div>
            </Link>
          </motion.div>

          <div
            className="hidden w-px shrink-0 bg-gradient-to-b from-transparent via-white/20 to-transparent lg:block"
            aria-hidden
          />

          <motion.div
            className="flex flex-1"
            initial={reduce ? false : { opacity: 0, x: 28 }}
            animate={reduce ? undefined : { opacity: 1, x: 0 }}
            transition={{ duration: 0.65, ease: easeArchitectural, delay: 0.12 }}
          >
            <Link
              href="/commercial"
              className={`${panelBase} rounded-sm lg:rounded-l-none lg:rounded-r-sm hover:z-[1] hover:shadow-[0_24px_80px_-24px_rgba(161,161,170,0.25)] focus-visible:z-[1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-400`}
            >
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-bl from-zinc-800/50 via-zinc-950/30 to-zinc-950 opacity-95 transition-opacity duration-500 group-hover:opacity-100"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -left-8 bottom-1/4 h-40 w-40 rounded-full bg-white/5 blur-3xl transition-all duration-700 group-hover:bg-white/10"
                aria-hidden
              />
              <div className="relative z-10 max-w-md lg:ml-auto lg:text-right">
                <span className="inline-flex rounded-full border border-white/15 bg-white/5 p-3 text-zinc-200 backdrop-blur-sm lg:ml-auto">
                  <Building2 className="h-7 w-7" strokeWidth={1.75} aria-hidden />
                </span>
                <h2 className="mt-8 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Commercial
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-zinc-400 sm:text-base">
                  Building envelopes, storefront and common-area upgrades, and phased exterior work for
                  property owners and operators who need accountable field execution.
                </p>
                <span className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-white lg:ml-auto">
                  Enter commercial experience
                  <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </div>
            </Link>
          </motion.div>
        </div>

        <p className="mt-10 text-center text-xs text-zinc-600">
          Already know your path? You can bookmark{" "}
          <Link href="/residential" className="text-zinc-400 underline-offset-2 hover:text-primary-aqua hover:underline">
            /residential
          </Link>{" "}
          or{" "}
          <Link href="/commercial" className="text-zinc-400 underline-offset-2 hover:text-primary-aqua hover:underline">
            /commercial
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
