import { audienceFromPath } from "./audience";

export type SiteNavItem = { href: string; label: string };

export function headerNavForPathname(pathname: string): SiteNavItem[] {
  if (pathname === "/") {
    return [
      { href: "/residential", label: "Residential" },
      { href: "/commercial", label: "Commercial" },
      { href: "/residential#contact", label: "Contact" },
    ];
  }

  const audience = audienceFromPath(pathname);
  if (audience) {
    const base = audience === "commercial" ? "/commercial" : "/residential";
    return [
      { href: base, label: "Home" },
      { href: `${base}#services`, label: "Services" },
      { href: `${base}#about`, label: "About" },
      { href: `${base}#contact`, label: "Contact" },
    ];
  }

  return [
    { href: "/", label: "Home" },
    { href: "/residential", label: "Residential" },
    { href: "/commercial", label: "Commercial" },
  ];
}

export function quoteCtaHref(pathname: string): string {
  const audience = audienceFromPath(pathname);
  if (audience === "commercial") return "/commercial#contact";
  if (audience === "residential") return "/residential#contact";
  return "/residential#contact";
}
