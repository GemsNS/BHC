"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Phone, X } from "lucide-react";
import { headerNavForPathname, quoteCtaHref } from "@/lib/marketing/siteNav";
import { publicAsset } from "@/lib/marketing/publicAsset";

export function SiteHeader() {
  const pathname = usePathname();
  const nav = headerNavForPathname(pathname);
  const isHome = pathname === "/" || pathname === "/residential" || pathname === "/commercial";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const transparent = isHome && !scrolled;
  const shell = transparent
    ? "site-header-transparent"
    : "site-header-solid";

  return (
    <header className={`site-header ${shell}`}>
      <div className="site-header-bar hidden sm:block">
        <div className="site-container site-header-bar-inner">
          <span>Denver Metro &amp; Front Range Colorado</span>
          <a href="tel:+13035550100" className="site-header-phone">
            <Phone className="h-3.5 w-3.5" aria-hidden />
            (303) 555-0100
          </a>
        </div>
      </div>

      <div className="site-container site-header-main">
        <Link href="/" className="site-logo-link">
          <Image
            src={publicAsset("/brand/newlogolight.png")}
            alt="Big Hoss Contracting"
            width={200}
            height={56}
            className="site-logo"
            priority
            unoptimized
          />
        </Link>

        <nav className="site-nav-desktop" aria-label="Primary">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="site-nav-link">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="site-header-actions">
          <Link href="/login" className="site-staff-link">
            Staff login
          </Link>
          <Link href={quoteCtaHref(pathname)} className="site-cta-btn hidden sm:inline-flex">
            Get a quote
          </Link>
          <button
            type="button"
            className="site-menu-btn lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen(!open)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav className="site-nav-mobile lg:hidden" aria-label="Mobile">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="site-nav-mobile-link" onClick={() => setOpen(false)}>
              {item.label}
            </Link>
          ))}
          <Link href="/login" className="site-nav-mobile-link" onClick={() => setOpen(false)}>
            Staff login
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
