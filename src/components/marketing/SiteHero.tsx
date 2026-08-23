import Link from "next/link";
import type { ProjectAudience } from "@/lib/marketing/audience";

const COPY = {
  residential: {
    title: "Precision in every build.",
    sub: "Roofing and exterior specialists for Colorado homeowners — storm-ready systems, photo-documented installs, and insurance-ready scopes.",
    primary: { href: "/residential#contact", label: "Request inspection" },
    secondary: { href: "/login", label: "Staff login" },
  },
  commercial: {
    title: "Exteriors that keep buildings working.",
    sub: "Phased envelope programs for multi-tenant and industrial properties — minimal disruption, accountable crews, portfolio reporting.",
    primary: { href: "/commercial#contact", label: "Request bid package" },
    secondary: { href: "/login", label: "Staff login" },
  },
} as const;

export function SiteHero({ audience }: { audience: ProjectAudience }) {
  const c = COPY[audience];
  return (
    <section className="site-hero" id="top">
      <div className="site-container site-hero-inner">
        <p className="site-hero-eyebrow">Big Hoss Contracting · {audience}</p>
        <h1 className="site-hero-title">{c.title}</h1>
        <p className="site-hero-sub">{c.sub}</p>
        <div className="site-hero-actions">
          <Link href={c.primary.href} className="site-cta-btn">
            {c.primary.label}
          </Link>
          <Link href={c.secondary.href} className="site-ghost-btn">
            {c.secondary.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
