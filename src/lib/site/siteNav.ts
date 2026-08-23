import type { ProjectAudience } from "@/lib/site/audience";

export type SiteNavItem = { href: string; label: string };

function audienceFromPath(pathname: string): ProjectAudience | null {
  if (pathname === "/commercial" || pathname.startsWith("/commercial/")) return "commercial";
  if (pathname === "/residential" || pathname.startsWith("/residential/")) return "residential";
  return null;
}

/** Primary navigation links for the global header (hash targets are audience-prefixed when applicable). */
export function headerNavForPathname(pathname: string): SiteNavItem[] {
  if (pathname === "/") {
    return [
      { href: "/residential", label: "Residential" },
      { href: "/commercial", label: "Commercial" },
      { href: "/showcase?audience=residential", label: "Showcase" },
      { href: "/residential#contact", label: "Contact" },
    ];
  }

  const audience = audienceFromPath(pathname);
  if (audience) {
    const base = audience === "commercial" ? "/commercial" : "/residential";
    return [
      { href: base, label: "Home" },
      { href: `/showcase?audience=${audience}`, label: "Showcase" },
      { href: `${base}#exterior-design`, label: "Designer" },
      { href: `${base}#services`, label: "Services" },
      { href: `${base}#gallery`, label: "Gallery" },
      { href: `${base}#about`, label: "About" },
      { href: `${base}#contact`, label: "Contact" },
    ];
  }

  return [
    { href: "/", label: "Home" },
    { href: "/showcase", label: "Showcase" },
    { href: "/residential#exterior-design", label: "Designer" },
    { href: "/residential#services", label: "Services" },
    { href: "/residential#gallery", label: "Gallery" },
    { href: "/residential#about", label: "About" },
    { href: "/residential#contact", label: "Contact" },
  ];
}

export function footerQuickLinksForPathname(pathname: string): SiteNavItem[] {
  if (pathname === "/") {
    return [
      { href: "/residential", label: "Residential" },
      { href: "/commercial", label: "Commercial" },
      { href: "/showcase?audience=residential", label: "Showcase" },
      { href: "/residential#gallery", label: "Gallery" },
      { href: "/residential#services", label: "Services" },
      { href: "/residential#about", label: "About" },
      { href: "/residential#contact", label: "Contact" },
    ];
  }

  const audience = audienceFromPath(pathname);
  if (audience) {
    const base = audience === "commercial" ? "/commercial" : "/residential";
    return [
      { href: base, label: "Home" },
      { href: `/showcase?audience=${audience}`, label: "Showcase" },
      { href: `${base}#gallery`, label: "Gallery" },
      { href: `${base}#services`, label: "Services" },
      { href: `${base}#about`, label: "About" },
      { href: `${base}#contact`, label: "Contact" },
    ];
  }

  return [
    { href: "/", label: "Home" },
    { href: "/showcase", label: "Showcase" },
    { href: "/residential#gallery", label: "Gallery" },
    { href: "/residential#services", label: "Services" },
    { href: "/residential#about", label: "About" },
    { href: "/residential#contact", label: "Contact" },
  ];
}

export function quoteCtaHref(pathname: string): string {
  const audience = audienceFromPath(pathname);
  if (audience) {
    return audience === "commercial" ? "/commercial#contact" : "/residential#contact";
  }
  if (pathname === "/") return "/residential#contact";
  return "/residential#contact";
}
