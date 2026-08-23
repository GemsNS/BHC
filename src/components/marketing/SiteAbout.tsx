import type { ProjectAudience } from "@/lib/marketing/audience";

const ABOUT = {
  residential:
    "We built Big Hoss Contracting on field accountability — every residential project gets a dedicated lead, daily photo updates, and a clean close-out package. Our crews live in the markets we serve, so we know which materials survive Colorado hail and which shortcuts fail in the first storm season.",
  commercial:
    "Commercial clients choose BHC when downtime is expensive. We phase work around tenant hours, coordinate with property managers, and report progress through our customer portal. The same intelligence layer that powers our internal ops keeps your portfolio visibility current.",
} as const;

export function SiteAbout({ audience }: { audience: ProjectAudience }) {
  return (
    <section className="site-section" id="about">
      <div className="site-container site-about-grid">
        <div>
          <h2 className="site-section-title">About BHC</h2>
          <p className="site-about-copy">{ABOUT[audience]}</p>
        </div>
        <ul className="site-about-stats">
          <li><strong>15+</strong> years field execution</li>
          <li><strong>Storm</strong> season rapid response</li>
          <li><strong>Photo</strong> documented every job</li>
          <li><strong>Portal</strong> for owners &amp; PMs</li>
        </ul>
      </div>
    </section>
  );
}
