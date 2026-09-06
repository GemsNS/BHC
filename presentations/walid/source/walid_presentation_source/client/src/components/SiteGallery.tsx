/** Architect's Sample Room: verified site-evidence gallery with no conceptual renderings. */
import { assets } from "@/data/project"

export default function SiteGallery() {
  return (
    <div className="evidence-grid">
      <div className="evidence-grid__lead">
        <img src={assets.site[3].src} alt={assets.site[3].label} />
        <span>SITE / {assets.site[3].label}</span>
      </div>
      {assets.site.filter((_, index) => index !== 3).map((image) => (
        <figure key={image.src}>
          <img src={image.src} alt={image.label} />
          <figcaption>SITE / {image.label}</figcaption>
        </figure>
      ))}
    </div>
  )
}
