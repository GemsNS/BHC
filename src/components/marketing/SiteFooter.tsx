import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-container site-footer-grid">
        <div>
          <p className="site-footer-brand">Big Hoss Contracting</p>
          <p className="site-footer-tag">
            Precision roofing, exteriors, and commercial envelope work across Colorado.
          </p>
        </div>
        <div>
          <p className="site-footer-heading">Explore</p>
          <ul className="site-footer-links">
            <li><Link href="/residential">Residential</Link></li>
            <li><Link href="/commercial">Commercial</Link></li>
            <li><Link href="/portal">Customer portal</Link></li>
            <li><Link href="/login">Staff login</Link></li>
          </ul>
        </div>
        <div>
          <p className="site-footer-heading">Contact</p>
          <p className="site-footer-contact">info@bighoss.com</p>
          <p className="site-footer-contact">(303) 555-0100</p>
        </div>
      </div>
      <p className="site-footer-copy">© {new Date().getFullYear()} Big Hoss Contracting · BHC Intelligence Platform</p>
    </footer>
  );
}
