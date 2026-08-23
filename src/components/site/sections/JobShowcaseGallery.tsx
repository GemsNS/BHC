import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/site/motion/Reveal";
import { filterShowcaseByAudience, type ProjectAudience } from "@/lib/site/audience";
import { JOB_SHOWCASE_IMAGES } from "@/lib/site/jobShowcaseImages";

export type JobShowcaseGalleryProps = { audience: ProjectAudience };

export function JobShowcaseGallery({ audience }: JobShowcaseGalleryProps) {
  const pool = filterShowcaseByAudience(JOB_SHOWCASE_IMAGES, audience);
  const featured = pool.slice(0, 8);
  const showcaseHref = `/showcase?audience=${audience}`;

  const heading =
    audience === "commercial"
      ? {
          eyebrow: "Commercial portfolio",
          title: "Exterior work for buildings in the real world",
          body: "A curated slice of completed scopes—cladding, openings, and envelope details—shown with the same rigor we bring to occupied and phased sites.",
        }
      : {
          eyebrow: "Completed work",
          title: "Real projects, built for coastal conditions",
          body: "Explore recent BH Contracting Co. projects across Halifax and Nova Scotia. Every image reflects the same priorities: clean detailing, weather-ready assemblies, and reliable communication.",
        };

  return (
    <section
      id="gallery"
      className="scroll-mt-32 border-t border-zinc-200/80 bg-white py-20 sm:scroll-mt-36 sm:py-28"
      aria-labelledby="gallery-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">
                {heading.eyebrow}
              </p>
              <h2
                id="gallery-heading"
                className="mt-4 text-3xl font-bold tracking-tight text-base-black sm:text-4xl lg:text-[2.35rem] lg:leading-snug"
              >
                {heading.title}
              </h2>
              <p className="mt-5 text-base leading-relaxed text-zinc-600 sm:text-lg">{heading.body}</p>
            </div>
            <Link
              href={showcaseHref}
              className="inline-flex w-fit rounded-sm bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
            >
              View full showcase
            </Link>
          </div>
        </Reveal>

        {featured.length ? (
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map((image, idx) => (
              <Reveal key={`${image.alt}-${idx}`} delay={idx * 0.04} y={20}>
                <figure className="group relative overflow-hidden rounded-sm border border-zinc-200/80 bg-zinc-100">
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
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-sm border border-zinc-300 bg-white px-5 py-4 text-sm text-zinc-600">
            No audience-matched gallery photos are tagged yet.
          </div>
        )}
      </div>
    </section>
  );
}
