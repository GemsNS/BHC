import Link from "next/link";
import type { ProjectAudience } from "@/lib/site/audience";

type QuoteInvitationProps = {
  audience: ProjectAudience;
};

const copy: Record<
  ProjectAudience,
  { kicker: string; title: string; body: string; bullets: readonly string[] }
> = {
  residential: {
    kicker: "Tailored estimates",
    title: "Formal pricing, prepared for your site",
    body: "Every project is measured against real conditions—access, detailing, and code. Share your goals and optional scope lines from the interactive designer; we respond with a clear written estimate.",
    bullets: [
      "No public rate sheet—numbers stay in your proposal",
      "Site-specific assumptions and options spelled out",
      "Same designer tool to describe siding, windows, and doors",
    ],
  },
  commercial: {
    kicker: "Project-based pricing",
    title: "Structured quotes for occupied and phased work",
    body: "Commercial exteriors demand sequencing, safety, and documentation. Tell us about the building, tenancy constraints, and target milestones—we align labour and materials in a proposal you can approve with confidence.",
    bullets: [
      "Internal costing—not a published menu",
      "Phasing and access reflected in the scope",
      "Envelope and opening packages quoted in context",
    ],
  },
};

export function QuoteInvitation({ audience }: QuoteInvitationProps) {
  const c = copy[audience];
  return (
    <section
      id="estimate-cta"
      className="scroll-mt-32 border-t border-zinc-200/80 bg-zinc-950 py-20 text-white sm:scroll-mt-36 sm:py-28"
      aria-labelledby="estimate-cta-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-5">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-aqua">{c.kicker}</p>
            <h2
              id="estimate-cta-heading"
              className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.2rem]"
            >
              {c.title}
            </h2>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-zinc-300 sm:text-base">{c.body}</p>
            <Link
              href="#contact"
              className="mt-8 inline-flex rounded-sm bg-primary-aqua px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Start a quote request
            </Link>
          </div>

          <ul className="grid gap-4 lg:col-span-7">
            {c.bullets.map((line) => (
              <li
                key={line}
                className="rounded-sm border border-white/10 bg-white/5 px-5 py-4 text-sm leading-relaxed text-zinc-200 backdrop-blur"
              >
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
