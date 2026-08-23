import type { ProjectAudience } from "@/lib/marketing/audience";

const SERVICES = {
  residential: [
    { title: "Roof replacement", detail: "Architectural shingle, metal, and flat systems with manufacturer warranties." },
    { title: "Storm restoration", detail: "Hail and wind damage documentation with adjuster-ready photo packages." },
    { title: "Siding & envelope", detail: "Fiber cement, composite, and trim packages engineered for Front Range weather." },
    { title: "Gutters & ventilation", detail: "Full drainage and attic airflow upgrades tied to manufacturer specs." },
  ],
  commercial: [
    { title: "TPO & mod-bit re-roofs", detail: "Warehouse, retail, and office bays with phased tenant coordination." },
    { title: "Metal & storefront", detail: "Standing seam and panel systems with safety-led access planning." },
    { title: "Preventive maintenance", detail: "Annual inspection programs with budget forecasting for asset managers." },
    { title: "Capital project support", detail: "Scope development, bid leveling, and install oversight for owners reps." },
  ],
} as const;

export function SiteServices({ audience }: { audience: ProjectAudience }) {
  const items = SERVICES[audience];
  return (
    <section className="site-section site-section-muted" id="services">
      <div className="site-container">
        <h2 className="site-section-title">Services</h2>
        <div className="site-services-grid">
          {items.map((s) => (
            <article key={s.title} className="site-service-card">
              <h3>{s.title}</h3>
              <p>{s.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
