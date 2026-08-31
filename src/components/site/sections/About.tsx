import Image from "next/image";
import { Reveal } from "@/components/site/motion/Reveal";
import { withBasePath } from "@/lib/site/withBasePath";
import type { ProjectAudience } from "@/lib/site/audience";

export type AboutProps = { audience: ProjectAudience };

export function About({ audience }: AboutProps) {
  const copy =
    audience === "commercial"
      ? {
          title: "Built for the coast. Trusted on complex sites.",
          paragraphs: [
            "BH Contracting LTD. supports owners and operators who need exterior work done right the first time—from cladding and openings to coordinated trim packages across multi-unit or retail footprints.",
            "We combine code-aware detailing with field pragmatism: protecting weathertight layers, respecting occupied buildings, and communicating clearly with everyone who depends on the schedule.",
          ],
        }
      : {
          title: "Built for the coast. Built to last.",
          paragraphs: [
            "At BH Contracting LTD., we believe your home should be as resilient as it is beautiful. Specializing in high-end residential builds and modern renovations across Nova Scotia, our team brings meticulous attention to detail and unwavering reliability to every project.",
            "We don't just build homes—we engineer living spaces designed to thrive in the coastal environment, with assemblies and finishes selected for performance in salt air, wind, and seasonal swings.",
          ],
        };

  return (
    <section
      id="about"
      className="scroll-mt-32 border-t border-zinc-200/80 bg-white py-20 sm:scroll-mt-36 sm:py-28"
      aria-labelledby="about-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16 xl:gap-20">
          <Reveal y={24}>
            <figure className="relative aspect-[4/3] overflow-hidden rounded-sm bg-white shadow-lg ring-1 ring-zinc-200/80 lg:aspect-[5/4]">
              <Image
                src={withBasePath("/brand/ns-flag-full.svg")}
                alt="Nova Scotia provincial flag — white field with blue saltire and shield"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain object-center p-6 sm:p-10 lg:p-12"
                unoptimized
                priority
              />
              <figcaption className="sr-only">Nova Scotia</figcaption>
            </figure>
          </Reveal>

          <div>
            <Reveal y={20}>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">
                About BH Contracting
              </p>
              <h2
                id="about-heading"
                className="mt-4 text-3xl font-bold tracking-tight text-base-black sm:text-4xl lg:text-[2.35rem] lg:leading-snug"
              >
                {copy.title}
              </h2>
              <div className="mt-6 space-y-4 text-base leading-relaxed text-zinc-600 sm:text-lg">
                {copy.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
