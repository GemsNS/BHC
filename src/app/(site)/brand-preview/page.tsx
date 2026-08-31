import Image from "next/image";
import Link from "next/link";
import { withBasePath } from "@/lib/site/withBasePath";

/**
 * Secluded page: vehicle wraps + four `1 (1)` … `1 (4).png` brand-direction boards.
 * Assets from `public/brand/` (sync via `npm run assets:sync`).
 */
const EXPLORATIONS = [
  { src: "/brand/exploration-1.png", title: "Brand direction 1" },
  { src: "/brand/exploration-2.png", title: "Brand direction 2" },
  { src: "/brand/exploration-3.png", title: "Brand direction 3" },
  { src: "/brand/exploration-4.png", title: "Brand direction 4" },
] as const;

export const metadata = {
  title: "Brand exploration | BH Contracting LTD.",
  description: "Internal brand direction references — not linked from public navigation.",
  robots: { index: false, follow: false },
};

export default function BrandPreviewPage() {
  return (
    <div className="min-h-screen bg-neutral-offwhite pb-20 pt-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="text-sm font-semibold text-primary-aqua transition-opacity hover:opacity-80"
        >
          ← Back to site
        </Link>

        <h1 className="mt-8 text-3xl font-extrabold tracking-tight text-base-black sm:text-4xl">
          Brand exploration
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-base-black/70">
          Reference materials for identity, fleet graphics, and future campaign directions. This
          page is not listed in the main navigation—share the URL directly with your team.
        </p>

        {/* Fleet — contained width, not a homepage hero */}
        <section className="mt-14" aria-labelledby="fleet-ref">
          <h2
            id="fleet-ref"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-aqua"
          >
            Fleet &amp; vehicle wraps
          </h2>
          <p className="mt-2 max-w-xl text-sm text-base-black/65">
            Mockups for pickup and cargo van applications—scaled for review, not as a full-bleed
            marketing hero.
          </p>
          <div className="mt-6 max-w-3xl rounded-xl border border-base-black/8 bg-base-white p-4 shadow-sm sm:p-6">
            <Image
              src={withBasePath("/brand/vehicle-promo.png")}
              alt="BH Contracting LTD. vehicle wrap concepts — pickup and cargo van"
              width={1600}
              height={1200}
              className="h-auto w-full object-contain"
              sizes="(max-width: 768px) 100vw, 768px"
              priority
              unoptimized
            />
            <p className="mt-3 text-center text-[11px] text-base-black/45">
              Brand mockups — not to scale.
            </p>
          </div>
        </section>

        <div className="mt-16 border-t border-base-black/10 pt-16">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-base-black/50">
            Direction boards
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-base-black/65">
            Four reference boards (
            <code className="rounded bg-base-black/5 px-1.5 py-0.5 text-xs">1 (1)</code> through{" "}
            <code className="rounded bg-base-black/5 px-1.5 py-0.5 text-xs">1 (4)</code>).
          </p>
        </div>

        <div className="mt-10 space-y-16">
          {EXPLORATIONS.map((item, i) => (
            <section key={item.src} aria-labelledby={`exploration-${i + 1}`}>
              <h2
                id={`exploration-${i + 1}`}
                className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary-aqua"
              >
                {item.title}
              </h2>
              <div className="overflow-hidden rounded-lg border border-base-black/10 bg-base-white shadow-sm">
                <Image
                  src={withBasePath(item.src)}
                  alt={item.title}
                  width={2400}
                  height={1600}
                  className="h-auto w-full object-contain"
                  sizes="(max-width: 1200px) 100vw, 1152px"
                  priority={i === 0}
                  unoptimized
                />
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
