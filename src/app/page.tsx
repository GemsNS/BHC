import Link from "next/link";

const modules = [
  {
    title: "Lead pipeline",
    copy: "Capture residential and commercial opportunities from the field to the office.",
  },
  {
    title: "Jobs & crews",
    copy: "Schedule envelope work, decks, renovations, and commercial phases with clear ownership.",
  },
  {
    title: "Door-to-door",
    copy: "Log canvass stops, outcomes, and convert appointments into CRM leads instantly.",
  },
  {
    title: "Fleet pulse",
    copy: "See trucks, vans, and trailers with live status for field coordination.",
  },
  {
    title: "Hours & payroll",
    copy: "Clock time against jobs and roll hours into simple payroll-ready totals.",
  },
  {
    title: "Employee portal",
    copy: "Field crews clock in/out from any phone without touching the admin desk.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <section className="hero-wash relative overflow-hidden text-[var(--foam)]">
        <div className="mx-auto flex min-h-[78vh] max-w-6xl flex-col justify-between px-6 py-10 sm:px-10">
          <header className="flex items-center justify-between">
            <p className="font-[family-name:var(--font-display)] text-2xl tracking-[0.08em] text-[var(--amber)] sm:text-3xl">
              BIG HOSS CONTRACTING
            </p>
            <div className="flex gap-3 text-sm">
              <Link
                href="/portal"
                className="rounded-md border border-white/25 px-3 py-2 text-white/85 transition hover:border-[var(--amber)] hover:text-[var(--amber)]"
              >
                Employee portal
              </Link>
              <Link
                href="/admin/dashboard"
                className="rounded-md bg-[var(--amber)] px-3 py-2 font-semibold text-[var(--ink)] transition hover:bg-[var(--amber-deep)] hover:text-white"
              >
                Open admin
              </Link>
            </div>
          </header>

          <div className="max-w-2xl pb-8 pt-16">
            <h1 className="font-[family-name:var(--font-display)] text-5xl leading-[0.95] tracking-wide sm:text-7xl">
              One ops desk for the whole crew.
            </h1>
            <p className="mt-5 max-w-xl text-base text-white/75 sm:text-lg">
              All-in-one CRM for residential and commercial contracting —
              leads, jobs, canvass routes, fleet, time clocks, and payroll in
              one place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/admin/dashboard"
                className="rounded-md bg-[var(--amber)] px-5 py-3 text-sm font-semibold text-[var(--ink)] transition hover:bg-white"
              >
                Launch admin panel
              </Link>
              <Link
                href="/portal"
                className="rounded-md border border-white/30 px-5 py-3 text-sm text-white/90 transition hover:bg-white/10"
              >
                Clock in as crew
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-grid mx-auto max-w-6xl px-6 py-16 sm:px-10">
        <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-wide text-[var(--ink)] sm:text-4xl">
          Connected tools, built for field ops
        </h2>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Foundation for Big Hoss Contracting — expandable as estimating,
          invoicing, GPS hardware, and payroll exports come online.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((mod) => (
            <article
              key={mod.title}
              className="border-l-2 border-[var(--amber)] bg-white/70 p-5"
            >
              <h3 className="font-[family-name:var(--font-display)] text-xl tracking-wide">
                {mod.title}
              </h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{mod.copy}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
