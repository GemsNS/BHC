"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Building2, Home, LogIn } from "lucide-react";
import { publicAsset } from "@/lib/marketing/publicAsset";

const panelBase =
  "site-gate-panel group relative flex min-h-[42vh] flex-1 flex-col justify-end overflow-hidden px-8 py-12 sm:min-h-[50vh] md:px-12 md:py-16 lg:min-h-0 lg:py-24";

export function AudienceGate() {
  return (
    <section className="site-gate" aria-labelledby="audience-gate-heading">
      <div className="site-gate-bg" aria-hidden>
        <Image
          src={publicAsset("/brand/newlogolight.png")}
          alt=""
          width={480}
          height={140}
          className="site-gate-watermark"
          unoptimized
        />
      </div>

      <div className="site-container site-gate-inner">
        <header className="site-gate-header">
          <p className="site-gate-eyebrow">Big Hoss Contracting</p>
          <h1 id="audience-gate-heading" className="site-gate-title">
            Choose how we can help
          </h1>
          <p className="site-gate-sub">
            Denver and the Front Range — two dedicated paths so we speak your language from the first click:
            homes and living spaces, or commercial buildings and portfolios.
          </p>
          <Link href="/login" className="site-gate-staff-btn">
            <LogIn className="h-4 w-4" aria-hidden />
            Staff login
          </Link>
        </header>

        <div className="site-gate-panels">
          <motion.div
            className="flex flex-1"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <Link href="/residential" className={`${panelBase} site-gate-panel site-gate-res`}>
              <span className="site-gate-icon">
                <Home className="h-7 w-7" strokeWidth={1.75} aria-hidden />
              </span>
              <h2 className="site-gate-panel-title">Residential</h2>
              <p className="site-gate-panel-copy">
                Roof replacement, storm restoration, siding, and detail-driven envelope work for homeowners
                who want durable results and clear communication.
              </p>
              <span className="site-gate-panel-cta">
                Enter residential experience →
              </span>
            </Link>
          </motion.div>

          <div className="site-gate-divider hidden lg:block" aria-hidden />

          <motion.div
            className="flex flex-1"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
          >
            <Link href="/commercial" className={`${panelBase} site-gate-panel site-gate-com`}>
              <span className="site-gate-icon site-gate-icon-com">
                <Building2 className="h-7 w-7" strokeWidth={1.75} aria-hidden />
              </span>
              <h2 className="site-gate-panel-title lg:text-right">Commercial</h2>
              <p className="site-gate-panel-copy lg:ml-auto lg:text-right">
                Building envelopes, TPO and mod-bit systems, storefront upgrades, and phased exterior work
                for property owners who need accountable field execution.
              </p>
              <span className="site-gate-panel-cta lg:ml-auto">
                Enter commercial experience →
              </span>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
