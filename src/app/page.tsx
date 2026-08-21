import Link from "next/link";

const modules = [
  {
    title: "Knocker app",
    copy: "Assign neighborhood zones, knock doors on phone, and watch results hit the admin board live.",
  },
  {
    title: "Job + material tracking",
    copy: "Subcontract jobs with contract value and material costs for real margin visibility.",
  },
  {
    title: "Fleet & fuel",
    copy: "Vehicle board plus fuel fills, odometer, and spend stats.",
  },
  {
    title: "Sales projections",
    copy: "Monthly revenue, job, and knock targets next to live pipeline stats.",
  },
  {
    title: "Roles & users",
    copy: "Admin, manager, sales, knocker, field, office, driver — each with app permissions.",
  },
  {
    title: "Web-hosted field apps",
    copy: "Install Knocker and Time Clock to the home screen — no store listing required.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <section className="hero-wash relative overflow-hidden text-[var(--foam)]">
        <div className="mx-auto flex min-h-[78vh] max-w-6xl flex-col justify-between px-6 py-10 sm:px-10">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-[family-name:var(--font-display)] text-2xl tracking-[0.08em] text-[var(--amber)] sm:text-3xl">
              BIG HOSS CONTRACTING
            </p>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                href="/apps"
                className="rounded-md border border-white/25 px-3 py-2 text-white/85 transition hover:border-[var(--amber)] hover:text-[var(--amber)]"
              >
                Field apps
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
              Subcontracting ops, from knock to closeout.
            </h1>
            <p className="mt-5 max-w-xl text-base text-white/75 sm:text-lg">
              All-in-one CRM for Big Hoss — knocker zones, jobs, materials, fuel,
              fleet, payroll, and role-based field apps in the browser.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/apps/knocker"
                className="rounded-md bg-[var(--amber)] px-5 py-3 text-sm font-semibold text-[var(--ink)] transition hover:bg-white"
              >
                Open Knocker app
              </Link>
              <Link
                href="/admin/zones"
                className="rounded-md border border-white/30 px-5 py-3 text-sm text-white/90 transition hover:bg-white/10"
              >
                Manage zones
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-grid mx-auto max-w-6xl px-6 py-16 sm:px-10">
        <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-wide text-[var(--ink)] sm:text-4xl">
          Built for a subcontracting crew
        </h2>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Start with Knocker + admin tracking. Expand into estimating, GPS
          hardware, and payroll exports as we go.
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
