"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { withBasePath } from "@/lib/site/withBasePath";
import Link from "next/link";
import { NovaScotiaFlag } from "@/components/site/NovaScotiaFlag";
import { footerQuickLinksForPathname } from "@/lib/site/siteNav";

export function Footer() {
  const pathname = usePathname();
  const quick = footerQuickLinksForPathname(pathname);
  const tagline =
    pathname.startsWith("/commercial") && pathname !== "/"
      ? "Commercial exterior and envelope work for Halifax and coastal Nova Scotia—field discipline, clear scopes, and finishes built for the Atlantic climate."
      : "Full-service residential construction for Halifax and coastal Nova Scotia—delivered with the accountability and craft you expect from a trusted partner.";

  return (
    <footer className="border-t-4 border-primary-aqua bg-zinc-950 text-zinc-200">
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-12 sm:px-6 sm:pb-16 sm:pt-14 lg:px-8">
        <div className="grid gap-12 border-b border-white/10 pb-12 sm:grid-cols-2 lg:grid-cols-12 lg:gap-10 lg:pb-14">
          <div className="lg:col-span-5">
            <Link href="/" className="inline-block">
              <Image
                src={withBasePath("/brand/newlogodark.png")}
                alt="Big Hoss Contracting"
                width={320}
                height={100}
                unoptimized
                className="h-auto w-auto max-w-[260px] object-contain object-left sm:max-w-[280px]"
              />
            </Link>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-zinc-400">{tagline}</p>
          </div>

          <nav className="lg:col-span-3" aria-label="Footer">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-aqua">
              Navigate
            </p>
            <ul className="mt-4 space-y-2.5 text-sm font-medium">
              {quick.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-zinc-300 transition-colors hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="lg:col-span-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-aqua">
              Contact
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <a href="tel:+19028099412" className="font-semibold text-white hover:text-primary-aqua">
                  (902) 809-9412
                </a>
              </li>
              <li>
                <a href="mailto:info@bighosscontracting.ca" className="hover:text-primary-aqua">
                  info@bighosscontracting.ca
                </a>
              </li>
              <li className="flex items-start gap-2.5 pt-1">
                <NovaScotiaFlag
                  size={22}
                  className="mt-0.5 shrink-0 rounded-sm shadow-sm ring-1 ring-white/15"
                />
                <span>Halifax, Nova Scotia</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">© {new Date().getFullYear()} Big Hoss Contracting. All rights reserved.</p>
          <p className="text-xs text-zinc-600">
            <Link
              href="/brand-preview"
              className="underline-offset-2 transition-colors hover:text-primary-aqua hover:underline"
            >
              Brand &amp; fleet reference
            </Link>
            <span className="mx-2 text-zinc-700" aria-hidden>
              ·
            </span>
            <span className="text-zinc-600">Internal use</span>
          </p>
          <p className="mt-3 text-[11px] text-zinc-700">made by: joel</p>
        </div>
      </div>
    </footer>
  );
}
