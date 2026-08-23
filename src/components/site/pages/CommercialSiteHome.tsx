import Image from "next/image";
import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  ClipboardList,
  HardHat,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { About } from "@/components/site/sections/About";
import { Contact } from "@/components/site/sections/Contact";
import { ExteriorDesigner } from "@/components/site/sections/ExteriorDesigner";
import { Hero } from "@/components/site/sections/Hero";
import { QuoteInvitation } from "@/components/site/sections/QuoteInvitation";
import { filterShowcaseByAudience } from "@/lib/site/audience";
import { JOB_SHOWCASE_IMAGES } from "@/lib/site/jobShowcaseImages";
import type { PricingItem } from "@/lib/site/pricingData";

type CommercialSiteHomeProps = {
  pricingItems: PricingItem[];
};

const capabilityCards = [
  {
    title: "Envelope rehabilitation",
    body: "Targeted replacement and retrofits for cladding, trims, and moisture-critical transitions.",
    icon: Layers,
  },
  {
    title: "Openings and storefronts",
    body: "Door and window packages coordinated with active operations, occupancy needs, and access constraints.",
    icon: Building2,
  },
  {
    title: "Phased execution",
    body: "Sequenced crews and communication plans built around tenants, public access, and weather windows.",
    icon: ClipboardList,
  },
  {
    title: "Safety and compliance",
    body: "Field discipline, documented scopes, and code-aware details from mobilization to closeout.",
    icon: ShieldCheck,
  },
] as const;

export function CommercialSiteHome({ pricingItems }: CommercialSiteHomeProps) {
  const commercialImages = filterShowcaseByAudience(JOB_SHOWCASE_IMAGES, "commercial");

  return (
    <>
      <Hero audience="commercial" />

      <section className="relative overflow-hidden border-b border-zinc-800 bg-zinc-950 pt-16 text-white sm:pt-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(45,212,191,0.16),transparent_45%),radial-gradient(circle_at_85%_20%,rgba(148,163,184,0.12),transparent_38%)]" />
        <div className="mx-auto grid max-w-7xl gap-14 px-4 pb-20 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:px-8 lg:pb-24">
          <div className="relative z-10 lg:col-span-7">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary-aqua">
              Commercial exterior division
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-[3.2rem] lg:leading-tight">
              Distinct execution for active commercial buildings.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">
              We do not run commercial work like residential jobs. Every scope is structured around occupancy,
              access, sequencing, and envelope performance for Nova Scotia weather cycles.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="#services"
                className="inline-flex rounded-sm bg-primary-aqua px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Explore capabilities
              </Link>
              <Link
                href="#gallery"
                className="inline-flex rounded-sm border border-zinc-600 px-6 py-3 text-sm font-semibold text-zinc-100 transition-colors hover:border-zinc-400 hover:bg-zinc-900"
              >
                View commercial projects
              </Link>
            </div>
          </div>

          <div className="relative z-10 lg:col-span-5">
            <div className="grid gap-3">
              {[
                "Dedicated commercial workflow",
                "Internal estimate model only (no public rates)",
                "Documented scope lines and sequencing",
                "Quote requests answered quickly",
              ].map((line) => (
                <div key={line} className="rounded-sm border border-zinc-800 bg-zinc-900/80 p-4 backdrop-blur">
                  <p className="flex items-start gap-2 text-sm text-zinc-200">
                    <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-aqua" />
                    {line}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="services"
        className="scroll-mt-32 border-b border-zinc-800 bg-zinc-900 py-18 text-white sm:scroll-mt-36 sm:py-24"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">Service model</p>
          <h2 className="mt-4 max-w-4xl text-3xl font-bold tracking-tight sm:text-4xl">
            Built for portfolios, operators, and projects that cannot pause.
          </h2>
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {capabilityCards.map((card) => (
              <article key={card.title} className="rounded-sm border border-zinc-700 bg-zinc-950/70 p-6">
                <card.icon className="h-6 w-6 text-primary-aqua" />
                <h3 className="mt-4 text-lg font-semibold">{card.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-300">{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="gallery"
        className="scroll-mt-32 border-b border-zinc-200/80 bg-zinc-50 py-20 sm:scroll-mt-36 sm:py-28"
        aria-labelledby="commercial-gallery-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">
                Commercial gallery
              </p>
              <h2
                id="commercial-gallery-heading"
                className="mt-4 text-3xl font-bold tracking-tight text-base-black sm:text-4xl lg:text-[2.35rem]"
              >
                Commercial projects only
              </h2>
              <p className="mt-5 text-base leading-relaxed text-zinc-600 sm:text-lg">
                This gallery is segmented to commercial-tagged images only, separate from residential home work.
              </p>
            </div>
            <Link
              href="/showcase?audience=commercial"
              className="inline-flex w-fit rounded-sm bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
            >
              Open full commercial showcase
            </Link>
          </div>

          {commercialImages.length ? (
            <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {commercialImages.slice(0, 12).map((image, idx) => (
                <figure
                  key={`${image.alt}-${idx}`}
                  className="group relative overflow-hidden rounded-sm border border-zinc-200/80 bg-zinc-100"
                >
                  <div className="relative aspect-[4/3]">
                    <Image
                      src={image.src}
                      alt={image.alt}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      placeholder="blur"
                    />
                  </div>
                </figure>
              ))}
            </div>
          ) : (
            <div className="mt-10 rounded-sm border border-zinc-300 bg-white px-5 py-4 text-sm text-zinc-600">
              No commercial photos are tagged yet. Add tagged commercial images in the showcase library.
            </div>
          )}
        </div>
      </section>

      <section className="border-b border-zinc-200 bg-white py-20 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          {[
            {
              title: "1. Scope alignment",
              body: "Start with building conditions, occupancy constraints, and outcome targets.",
              icon: ClipboardList,
            },
            {
              title: "2. Field planning",
              body: "Sequence access, envelope details, and materials around operational realities.",
              icon: HardHat,
            },
            {
              title: "3. Delivered estimate",
              body: "Receive a documented proposal built from internal rates and project conditions.",
              icon: BadgeCheck,
            },
          ].map((step) => (
            <article key={step.title} className="rounded-sm border border-zinc-200 bg-zinc-50 p-6">
              <step.icon className="h-5 w-5 text-primary-aqua" />
              <h3 className="mt-4 text-lg font-semibold text-base-black">{step.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <ExteriorDesigner pricingItems={pricingItems} />
      <QuoteInvitation audience="commercial" />
      <About audience="commercial" />
      <Contact />
    </>
  );
}
