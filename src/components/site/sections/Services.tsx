import type { LucideIcon } from "lucide-react";
import { Building2, ClipboardList, Hammer, Home, Layers, Sun, Warehouse } from "lucide-react";
import { Reveal } from "@/components/site/motion/Reveal";
import { WaveIcon } from "@/components/site/WaveIcon";
import type { ProjectAudience } from "@/lib/site/audience";

const residentialItems: readonly { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: "General contracting",
    body: "Comprehensive project management from initial design to final walkthrough—on schedule, on budget, and coordinated end to end.",
    icon: ClipboardList,
  },
  {
    title: "Residential renovations",
    body: "Modernizing interiors with high-end finishes, structural updates, and seamless additions that elevate value and livability.",
    icon: Home,
  },
  {
    title: "Custom decks & patios",
    body: "Resilient outdoor living spaces engineered for Maritime weather—built to look sharp and stand up to the elements.",
    icon: Sun,
  },
  {
    title: "Finish carpentry",
    body: "Exacting detail on custom millwork, trim, cabinetry, and architectural focal points that define the character of a home.",
    icon: Hammer,
  },
];

const commercialItems: readonly { title: string; body: string; icon: LucideIcon }[] = [
  {
    title: "Building envelope & cladding",
    body: "Siding, trim, and weather-resistant transitions for retail, office, and light industrial shells—specified for coastal exposure.",
    icon: Layers,
  },
  {
    title: "Openings & storefront packages",
    body: "Doors, glazing coordination, and exterior finishing around high-traffic entries where durability and appearance both matter.",
    icon: Building2,
  },
  {
    title: "Capital & maintenance projects",
    body: "Phased exterior refreshes aligned with budgets and occupancy—clear communication with owners and site contacts throughout.",
    icon: Warehouse,
  },
  {
    title: "GC coordination",
    body: "We integrate with your construction manager or in-house team, matching schedules, safety expectations, and quality benchmarks.",
    icon: ClipboardList,
  },
];

export type ServicesProps = { audience: ProjectAudience };

export function Services({ audience }: ServicesProps) {
  const items = audience === "commercial" ? commercialItems : residentialItems;
  const heading =
    audience === "commercial"
      ? {
          eyebrow: "Commercial capabilities",
          title: "Exterior scope for buildings that stay in service",
          intro:
            "Whether you are refreshing a street presence or restoring a full elevation, we bring the same discipline: documented scopes, respectful crews, and finishes chosen for Atlantic weather.",
        }
      : {
          eyebrow: "Markets & capabilities",
          title: "Full-service residential construction",
          intro:
            "Whether you're refreshing a single elevation or orchestrating a complex renovation, we bring the same discipline: clear communication, tight site coordination, and craft you can see in the details.",
        };

  return (
    <section
      id="services"
      className="scroll-mt-32 border-t border-zinc-200/80 bg-zinc-50 py-20 sm:scroll-mt-36 sm:py-28"
      aria-labelledby="services-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">
              {heading.eyebrow}
            </p>
            <h2
              id="services-heading"
              className="mt-4 text-3xl font-bold tracking-tight text-base-black sm:text-4xl lg:text-[2.35rem] lg:leading-snug"
            >
              {heading.title}
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
              {heading.intro}
            </p>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-px bg-zinc-200/90 sm:grid-cols-2 lg:mt-16 lg:grid-cols-2">
          {items.map((item, i) => (
            <Reveal key={item.title} delay={i * 0.05} y={22}>
              <article className="group h-full bg-zinc-50 p-8 transition-colors duration-300 hover:bg-white sm:p-10">
                <WaveIcon
                  icon={item.icon}
                  className="mb-6 text-primary-aqua transition-transform duration-300 group-hover:scale-105"
                />
                <h3 className="text-lg font-bold text-base-black">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-600">{item.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
