"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, Phone, X } from "lucide-react";
import { withBasePath } from "@/lib/site/withBasePath";
import { headerNavForPathname, quoteCtaHref } from "@/lib/site/siteNav";

export function Header() {
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

  const navLinkClass = transparent
    ? "site-nav-link text-white hover:text-primary-aqua"
    : "site-nav-link-muted text-white hover:text-primary-aqua";

  const headerShell = transparent
    ? "border-transparent bg-black/25 backdrop-blur-sm"
    : "border-zinc-800/80 bg-zinc-950/98 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5)] backdrop-blur-sm";

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,box-shadow,border-color] duration-300 ease-out ${headerShell}`}
    >
      <div
        className={`hidden sm:block ${transparent ? "bg-black/35 text-white/95" : "bg-zinc-900 text-white/95"}`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 text-xs font-medium sm:px-6 lg:px-8">
          <span className="tracking-wide">Halifax &amp; coastal Nova Scotia</span>
          <a href="tel:+19028099412" className="inline-flex items-center gap-2 transition-colors hover:text-primary-aqua">
            <Phone className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            (902) 809-9412
          </a>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8 lg:py-4">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Image
            src={withBasePath("/brand/bh-logo-dark.svg")}
            alt="BH Contracting Co."
            width={200}
            height={56}
            className="h-11 w-auto max-w-[200px] object-contain object-left sm:h-12"
            priority
            unoptimized
          />
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium lg:flex" aria-label="Primary">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`transition-colors duration-200 ${navLinkClass}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/login"
            className={`hidden text-sm font-medium transition-colors sm:inline-flex ${navLinkClass}`}
          >
            Staff login
          </Link>
          <Link
            href={quoteCtaHref(pathname)}
            className="hidden rounded-sm bg-primary-aqua px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-92 sm:inline-flex"
          >
            Get a quote
          </Link>

          <button
            type="button"
            className="inline-flex rounded-sm p-2 text-white lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            <span className="sr-only">Toggle menu</span>
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="mobile-nav"
          className="border-t border-zinc-200 bg-white px-4 py-4 shadow-inner lg:hidden"
        >
          <nav className="flex flex-col gap-1 text-sm font-medium text-zinc-800">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-sm px-2 py-2.5 hover:bg-zinc-50"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={quoteCtaHref(pathname)}
              className="mt-2 rounded-sm bg-primary-aqua px-4 py-3 text-center font-semibold text-white"
              onClick={() => setOpen(false)}
            >
              Get a quote
            </Link>
            <Link
              href="/login"
              className="rounded-sm px-2 py-2.5 hover:bg-zinc-50"
              onClick={() => setOpen(false)}
            >
              Staff login
            </Link>
            <a href="tel:+19028099412" className="flex items-center gap-2 px-2 py-2 text-primary-aqua">
              <Phone className="h-4 w-4" />
              (902) 809-9412
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
