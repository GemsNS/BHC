import { Reveal } from "@/components/site/motion/Reveal";
import type { ProjectAudience } from "@/lib/site/audience";

const residentialPillars = [
  {
    title: "Mobilize the right team",
    body:
      "From renovations to custom exteriors, we align the right trades and sequencing so your project moves efficiently—without sacrificing coastal build quality.",
  },
  {
    title: "Value that holds",
    body:
      "Clear scopes, honest timelines, and finishes engineered for Nova Scotia’s weather. We focus on outcomes that protect your investment long after walkthrough.",
  },
  {
    title: "Innovation & craft",
    body:
      "Modern materials, code-aware detailing, and meticulous carpentry—whether you’re refreshing a façade or reimagining how your home meets the shore.",
  },
] as const;

const commercialPillars = [
  {
    title: "Phased, accountable delivery",
    body:
      "We plan exterior work around occupancy, access, and safety—so upgrades to cladding, openings, and trim advance without surprises for your team or tenants.",
  },
  {
    title: "Envelope-first thinking",
    body:
      "Coastal wind, moisture, and seasonal movement drive our details. We specify assemblies that protect the asset and simplify long-term maintenance.",
  },
  {
    title: "Single partner for the shell",
    body:
      "From storefront refreshes to multi-elevation packages, Big Hoss coordinates siding, windows, doors, and finish carpentry under one clear field standard.",
  },
] as const;

export type ValuePropositionProps = { audience: ProjectAudience };

export function ValueProposition({ audience }: ValuePropositionProps) {
  const pillars = audience === "commercial" ? commercialPillars : residentialPillars;
  const sectionLead =
    audience === "commercial"
      ? {
          kicker: "Why Big Hoss",
          title: "Commercial exterior work with residential-grade finish discipline.",
          body: "Property teams choose us when the building cannot afford loose ends: documented scopes, respectful site presence, and craftsmanship visible at the details.",
        }
      : {
          kicker: "Why Big Hoss",
          title: "The flexibility to deliver unique solutions—and the focus to deliver value to your bottom line.",
          body: "Partnering with Big Hoss means a reliable, full-service residential partner rooted in Halifax and coastal Nova Scotia: proven craft, transparent communication, and builds designed to thrive where salt air and storms set the bar.",
        };

  return (
    <section
      className="border-y border-zinc-200/80 bg-zinc-50 py-16 sm:py-20"
      aria-labelledby="value-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">
              {sectionLead.kicker}
            </p>
            <h2
              id="value-heading"
              className="mt-4 text-3xl font-bold tracking-tight text-base-black sm:text-4xl lg:text-[2.35rem] lg:leading-snug"
            >
              {sectionLead.title}
            </h2>
            <p className="mt-6 text-base leading-relaxed text-zinc-600 sm:text-lg">{sectionLead.body}</p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-10 border-t border-zinc-200 pt-14 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12 lg:pt-16">
          {pillars.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.06} y={20}>
              <div>
                <h3 className="text-lg font-bold text-base-black">{p.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-600">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
