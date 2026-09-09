"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  Check,
  Clock3,
  MapPinned,
  Phone,
  ShieldCheck,
  Snowflake,
  ThermometerSnowflake,
} from "lucide-react";
import { motion } from "framer-motion";
import { ContactForm } from "@/components/site/ContactForm";
import { Reveal } from "@/components/site/motion/Reveal";
import { easeArchitectural } from "@/components/site/motion/easing";
import { usePrefersReducedMotion } from "@/components/site/motion/usePrefersReducedMotion";
import {
  SNOW_ADD_ONS,
  SNOW_PACKAGES,
  SNOW_SEASON_LABEL,
  SNOW_SERVICE_AREA,
  snowPackageQuoteDetails,
  type SnowPackage,
  type SnowPackageId,
} from "@/lib/site/snowPackages";

const flakes = [
  { left: "8%", delay: "0s", duration: "11s", size: 3 },
  { left: "18%", delay: "1.2s", duration: "13s", size: 2 },
  { left: "27%", delay: "0.4s", duration: "10s", size: 4 },
  { left: "39%", delay: "2.1s", duration: "14s", size: 2 },
  { left: "48%", delay: "0.8s", duration: "12s", size: 3 },
  { left: "58%", delay: "1.7s", duration: "15s", size: 2 },
  { left: "67%", delay: "0.2s", duration: "11s", size: 5 },
  { left: "76%", delay: "2.6s", duration: "13s", size: 2 },
  { left: "86%", delay: "1.1s", duration: "12s", size: 3 },
  { left: "94%", delay: "0.6s", duration: "16s", size: 2 },
] as const;

function SnowHero({ onBook }: { onBook: () => void }) {
  const reduce = usePrefersReducedMotion();

  const item = reduce
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : {
        // Keep opacity at 1 for hydration / screenshot safety; animate position only.
        hidden: { opacity: 1, y: 18 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.55, ease: easeArchitectural },
        },
      };

  return (
    <section className="snow-hero relative min-h-[100dvh] overflow-hidden text-white">
      <div className="snow-hero-sky absolute inset-0" aria-hidden />
      <div className="snow-hero-ground absolute inset-x-0 bottom-0 h-[42%] sm:h-[38%]" aria-hidden />
      <div className="snow-hero-drive absolute inset-x-0 bottom-0 h-[28%]" aria-hidden />
      <div className="snow-hero-glow absolute inset-0" aria-hidden />

      {!reduce ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {flakes.map((f, i) => (
            <span
              key={i}
              className="snow-hero-flake"
              style={{
                left: f.left,
                width: f.size,
                height: f.size,
                animationDelay: f.delay,
                animationDuration: f.duration,
              }}
            />
          ))}
        </div>
      ) : null}

      <div className="relative z-10 flex min-h-[100dvh] flex-col justify-end px-4 pb-16 pt-28 sm:px-6 sm:pb-20 sm:pt-32 lg:px-8 lg:pb-24">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-[#071018] via-[#071018]/85 to-transparent" aria-hidden />
        <div className="relative mx-auto w-full max-w-7xl">
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              show: {
                transition: reduce
                  ? { staggerChildren: 0 }
                  : { staggerChildren: 0.09, delayChildren: 0.05 },
              },
            }}
            className="max-w-3xl"
          >
            <motion.p
              variants={item}
              className="text-sm font-semibold uppercase tracking-[0.34em] text-primary-aqua sm:text-base"
            >
              BH Contracting LTD.
            </motion.p>
            <motion.h1
              variants={item}
              className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-[3.45rem] lg:leading-[1.05]"
            >
              Snow removal for Halifax winters—cleared before you need the driveway.
            </motion.h1>
            <motion.p
              variants={item}
              className="mt-6 max-w-xl text-base leading-relaxed text-zinc-200 sm:text-lg"
            >
              Seasonal packages for HRM homes and commercial routes, priced against local market
              comps and delivered by insured crews who already work this coast.
            </motion.p>
            <motion.div variants={item} className="mt-9 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onBook}
                className="inline-flex rounded-sm bg-primary-aqua px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                View season packages
              </button>
              <a
                href="tel:+19028099412"
                className="inline-flex items-center gap-2 rounded-sm border border-white/25 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition-colors hover:border-white/45 hover:bg-white/10"
              >
                <Phone className="h-4 w-4" aria-hidden />
                (902) 809-9412
              </a>
            </motion.div>
            <motion.p variants={item} className="mt-8 text-xs uppercase tracking-[0.22em] text-zinc-400">
              {SNOW_SEASON_LABEL} · {SNOW_SERVICE_AREA}
            </motion.p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function PackageCard({
  pkg,
  selected,
  onSelect,
}: {
  pkg: SnowPackage;
  selected: boolean;
  onSelect: (pkg: SnowPackage) => void;
}) {
  return (
    <article
      className={`relative flex h-full flex-col border p-6 transition-[border-color,background-color,transform] duration-300 sm:p-7 ${
        pkg.featured
          ? "border-primary-aqua/70 bg-zinc-950 shadow-[0_0_0_1px_rgba(0,180,216,0.25)]"
          : "border-zinc-700/80 bg-zinc-950/70"
      } ${selected ? "ring-2 ring-primary-aqua/70" : ""}`}
    >
      {pkg.featured ? (
        <span className="absolute -top-3 left-6 rounded-sm bg-primary-aqua px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
          Most booked
        </span>
      ) : null}
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary-aqua">
        {pkg.eyebrow}
      </p>
      <h3 className="mt-3 text-2xl font-bold tracking-tight text-white">{pkg.name}</h3>
      <div className="mt-5 flex items-end gap-2">
        <span className="text-4xl font-bold tracking-tight text-white">{pkg.priceLabel}</span>
        <span className="pb-1 text-xs uppercase tracking-[0.14em] text-zinc-400">{pkg.priceNote}</span>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-zinc-300">{pkg.blurb}</p>
      <p className="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
        {pkg.trigger} · {pkg.bestFor}
      </p>
      <ul className="mt-6 flex-1 space-y-3">
        {pkg.includes.map((line) => (
          <li key={line} className="flex gap-2.5 text-sm leading-snug text-zinc-200">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-aqua" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onSelect(pkg)}
        className={`mt-8 inline-flex w-full items-center justify-center rounded-sm px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-92 ${
          selected
            ? "bg-white text-zinc-950"
            : "bg-primary-aqua text-white"
        }`}
      >
        {selected ? "Selected — continue below" : "Select this package"}
      </button>
    </article>
  );
}

export function SnowRemovalPage() {
  const [selectedId, setSelectedId] = useState<SnowPackageId>("home-shield");
  const selected = SNOW_PACKAGES.find((p) => p.id === selectedId) ?? SNOW_PACKAGES[1];
  const [quoteDetails, setQuoteDetails] = useState(() => snowPackageQuoteDetails(SNOW_PACKAGES[1]));

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const selectPackage = useCallback(
    (pkg: SnowPackage) => {
      setSelectedId(pkg.id);
      setQuoteDetails(snowPackageQuoteDetails(pkg));
      window.setTimeout(() => scrollTo("contact"), 80);
    },
    [scrollTo],
  );

  return (
    <>
      <SnowHero onBook={() => scrollTo("packages")} />

      <section className="border-b border-zinc-800 bg-zinc-950 py-14 text-white sm:py-16">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
          {[
            {
              icon: MapPinned,
              title: "HRM routes",
              body: "Halifax, Dartmouth, Bedford, Sackville, and nearby communities on planned storm circuits.",
            },
            {
              icon: Clock3,
              title: "Storm-first dispatch",
              body: "Crews mobilize to the forecast—not after you’re already stuck in the driveway.",
            },
            {
              icon: ShieldCheck,
              title: "Insured & accountable",
              body: "Documented visits, clear package scopes, and the same BH Contracting standards as our builds.",
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-4">
              <item.icon className="mt-1 h-5 w-5 shrink-0 text-primary-aqua" aria-hidden />
              <div>
                <h2 className="text-base font-semibold text-white">{item.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        id="packages"
        className="scroll-mt-28 border-b border-zinc-200 bg-[#f3f6f8] py-20 sm:scroll-mt-32 sm:py-28"
        aria-labelledby="packages-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">
                Season packages
              </p>
              <h2
                id="packages-heading"
                className="mt-4 text-3xl font-bold tracking-tight text-base-black sm:text-4xl lg:text-[2.4rem] lg:leading-snug"
              >
                Transparent starting rates for Halifax Regional Municipality.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
                Built from current HRM comparables—budget seasonal plans near $580–$960, premium
                local packages from about $1,200–$2,600, and typical per-push driveway clears at
                $45–$90. Our tiers land in the middle: serious coverage without retainer sticker
                shock.
              </p>
            </div>
          </Reveal>

          <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {SNOW_PACKAGES.map((pkg, i) => (
              <Reveal key={pkg.id} delay={i * 0.05} y={22}>
                <PackageCard
                  pkg={pkg}
                  selected={selectedId === pkg.id}
                  onSelect={selectPackage}
                />
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.12}>
            <p className="mt-10 max-w-3xl text-sm leading-relaxed text-zinc-600">
              Starting prices assume a typical single residential driveway. Steep grades, shared
              accesses, long runs, and commercial footprints are confirmed after a quick address
              review—no mid-season bait-and-switch.
            </p>
          </Reveal>
        </div>
      </section>

      <section
        id="coverage"
        className="scroll-mt-28 border-b border-zinc-800 bg-zinc-950 py-20 text-white sm:scroll-mt-32 sm:py-28"
      >
        <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-5">
            <Reveal>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">
                How service runs
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Clear when the storm clears—not the next afternoon.
              </h2>
              <p className="mt-5 text-base leading-relaxed text-zinc-300">
                We watch Environment Canada for HRM, stage salt and blades before the band hits, and
                work properties in route order so residential and commercial clients get predictable
                windows.
              </p>
            </Reveal>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
            {[
              {
                icon: Snowflake,
                title: "Season lock-in",
                body: "November through April coverage with berm re-clears after city plows pass.",
              },
              {
                icon: ThermometerSnowflake,
                title: "Ice control",
                body: "Treated melt on Home Shield and Property Care—applied to conditions, not dumped by habit.",
              },
              {
                icon: Clock3,
                title: "Multi-day events",
                body: "We return through prolonged systems so packed lanes do not set overnight.",
              },
              {
                icon: ShieldCheck,
                title: "Written scope",
                body: "Package inclusions match the seasonal agreement—same clarity we use on build contracts.",
              },
            ].map((item, i) => (
              <Reveal key={item.title} delay={i * 0.04} y={18}>
                <div className="h-full border border-zinc-800 bg-zinc-900/60 p-5">
                  <item.icon className="h-5 w-5 text-primary-aqua" aria-hidden />
                  <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-200 bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">
                À la carte
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-base-black sm:text-4xl">
                Not ready for a season plan?
              </h2>
              <p className="mt-4 text-base text-zinc-600">
                Per-visit options track common HRM push pricing. Availability tightens in major
                storms—seasonal clients stay first in the queue.
              </p>
            </div>
          </Reveal>
          <div className="mt-12 grid gap-px bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4">
            {SNOW_ADD_ONS.map((item, i) => (
              <Reveal key={item.title} delay={i * 0.04} y={16}>
                <div className="h-full bg-white p-6 sm:p-7">
                  <h3 className="text-base font-semibold text-base-black">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-600">{item.detail}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-800 bg-zinc-950 py-16 text-white sm:py-20">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:flex-row sm:items-end sm:justify-between sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">
              Selected
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {selected.name} · {selected.priceLabel}
            </h2>
            <p className="mt-3 text-sm text-zinc-400 sm:text-base">
              Tell us your address and we will confirm the final season rate for your property.
            </p>
          </div>
          <Link
            href="#contact"
            className="inline-flex shrink-0 rounded-sm bg-primary-aqua px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Request this package
          </Link>
        </div>
      </section>

      <section
        id="contact"
        className="scroll-mt-28 bg-[#eef3f6] py-20 sm:scroll-mt-32 sm:py-28"
        aria-labelledby="snow-contact-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <Reveal>
              <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">
                  Book the season
                </p>
                <h2
                  id="snow-contact-heading"
                  className="mt-4 text-3xl font-bold tracking-tight text-base-black sm:text-4xl"
                >
                  Lock in snow coverage before the first band lands.
                </h2>
                <p className="mt-5 text-base leading-relaxed text-zinc-600 sm:text-lg">
                  Choose a package above—your inquiry pre-fills with that tier. Or call{" "}
                  <a
                    href="tel:+19028099412"
                    className="font-semibold text-zinc-900 transition-colors hover:text-primary-aqua"
                  >
                    (902) 809-9412
                  </a>
                  .
                </p>
              </div>
            </Reveal>

            <div className="mt-14 grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-x-20">
              <Reveal delay={0.05} y={20}>
                <div className="rounded-sm border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
                  <ContactForm
                    defaultQuoteType="other"
                    details={quoteDetails}
                    onDetailsChange={setQuoteDetails}
                    otherLabel="Snow removal"
                    otherHint="Seasonal packages, per-visit clears, ice melt, and commercial routes."
                  />
                </div>
              </Reveal>

              <Reveal delay={0.08} y={20}>
                <aside className="space-y-8 lg:pl-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">
                      Market note
                    </p>
                    <p className="mt-4 text-sm leading-relaxed text-zinc-600">
                      Halifax residential driveway pushes commonly run $45–$90. Seasonal contracts
                      across the region span roughly $580 on light plans to $2,600+ for full walkway
                      and ice programs. Commercial lot pushes often sit near $180–$420 depending on
                      size and SLA. BH packages are calibrated to that band for {SNOW_SEASON_LABEL}.
                    </p>
                  </div>
                  <div className="border-t border-zinc-200 pt-8">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">
                      Direct
                    </p>
                    <ul className="mt-5 space-y-4 text-base text-zinc-700">
                      <li>
                        <a
                          href="tel:+19028099412"
                          className="font-semibold text-zinc-900 transition-colors hover:text-primary-aqua"
                        >
                          (902) 809-9412
                        </a>
                      </li>
                      <li>
                        <a
                          href="mailto:info@bhcontracting.ca"
                          className="font-semibold text-zinc-900 transition-colors hover:text-primary-aqua"
                        >
                          info@bhcontracting.ca
                        </a>
                      </li>
                      <li className="text-sm text-zinc-600">{SNOW_SERVICE_AREA}</li>
                    </ul>
                  </div>
                  <div className="border-t border-zinc-200 pt-8">
                    <Link
                      href="/contracts/snow"
                      className="text-sm font-semibold text-primary-aqua transition-opacity hover:opacity-80"
                    >
                      Review the snow service agreement PDF →
                    </Link>
                  </div>
                </aside>
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
