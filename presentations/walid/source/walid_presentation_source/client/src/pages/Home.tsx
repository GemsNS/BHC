/**
 * Architect's Sample Room: long-form editorial proposal board.
 * Evidence, decisions, and downloads remain visible in one continuous page.
 */
import { useEffect, useState } from "react"
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  Menu,
  Phone,
  Ruler,
  ShieldCheck,
  X,
} from "lucide-react"
import ConceptGallery from "@/components/ConceptGallery"
import ContractReview from "@/components/ContractReview"
import DownloadLibrary from "@/components/DownloadLibrary"
import MeasurementBoard from "@/components/MeasurementBoard"
import ModelStudio from "@/components/ModelStudio"
import SiteGallery from "@/components/SiteGallery"
import { assets, pricing, takeoff } from "@/data/project"

const navItems = [
  ["Designs", "#designs"],
  ["3D Model", "#model"],
  ["Plans", "#plans"],
  ["Scope", "#scope"],
  ["Contract", "#contract"],
  ["Files", "#files"],
]

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 36)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add("is-visible")),
      { threshold: 0.08, rootMargin: "0px 0px -60px" },
    )
    document.querySelectorAll("[data-reveal]").forEach((element) => observer.observe(element))

    return () => {
      window.removeEventListener("scroll", onScroll)
      observer.disconnect()
    }
  }, [])

  const totalSquares = takeoff.reduce((sum, row) => sum + row.squares, 0)

  return (
    <div className="site-shell">
      <header className={`topbar ${scrolled ? "is-scrolled" : ""}`}>
        <a className="brand" href="#top" aria-label="BH Contracting presentation home">
          <img src={assets.logo} alt="BH Contracting folded profile mark" />
          <span><b>BH CONTRACTING</b><small>Exterior proposal / 2026</small></span>
        </a>

        <nav className={menuOpen ? "is-open" : ""} aria-label="Presentation navigation">
          {navItems.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
          ))}
          <a className="nav-contact" href="mailto:info@bhcontracting.ca">Contact BH</a>
        </nav>

        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">
          {menuOpen ? <X /> : <Menu />}
        </button>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero__grid" aria-hidden="true" />
          <div className="hero__copy" data-reveal>
            <div className="hero__brand-stamp">
              <img src={assets.logo} alt="BH Contracting folded-profile monogram" />
              <div><b>BH CONTRACTING LTD.</b><span>Building-envelope proposal studio</span></div>
            </div>
            <span className="eyebrow">PRIVATE CLIENT PRESENTATION / WALID WAREHOUSE</span>
            <h1>One shell.<br /><em>Four</em> exterior systems.</h1>
            <p className="hero__lede">A complete façade review for the warehouse extension at 9 Alicia Scott Ave.—design options, interactive model, verified dimensions, takeoff, scope, pricing, and contract controls in one place.</p>
            <div className="hero__actions">
              <a className="button button--cedar" href="#designs">Compare the façade systems <ArrowDown size={17} /></a>
              <a className="button button--outline" href="#contract"><FileText size={17} /> Review contract</a>
            </div>
            <div className="hero__status">
              <span><CheckCircle2 /> Permit geometry reconstructed</span>
              <span><CheckCircle2 /> Four application systems prepared</span>
              <span><Ruler /> Field verification remains required</span>
            </div>
          </div>

          <div className="hero__visual" data-reveal>
            <img src={assets.hero} alt="Verified construction photograph of the warehouse and downhill driveway side" />
            <div className="hero__visual-overlay" />
            <div className="hero__plate-label">
              <span>SITE PHOTOGRAPH / EXISTING CONDITION</span>
              <b>9 ALICIA SCOTT AVE.</b>
            </div>
            <div className="hero__dimension">
              <small>Overall shell</small>
              <strong>15.42 × 12.38 m</strong>
            </div>
          </div>
        </section>

        <section className="project-strip" aria-label="Project summary">
          <div><span>PROJECT</span><b>Warehouse extension</b></div>
          <div><span>LOCATION</span><b>Mount Uniacke, NS</b></div>
          <div><span>MODEL DATUM</span><b>9.12 m slab to ridge</b></div>
          <div><span>PRICING BASIS</span><b>30 siding squares + 2 doors</b></div>
          <div><span>STATUS</span><b>Concept / contract draft</b></div>
        </section>

        <section className="intro section-paper" data-reveal>
          <div className="section-index"><span>00</span><b>PROJECT BRIEF</b></div>
          <div className="intro__title">
            <span className="eyebrow">BH CONTRACTING LTD.</span>
            <h2>From permit elevations to a customer-ready exterior decision.</h2>
          </div>
          <div className="intro__body">
            <p>The building shell was reconstructed from the supplied permit set and checked against current construction photographs. The façade studies preserve the verified overall dimensions and opening locations while testing distinct siding, cladding, and fascia strategies.</p>
            <p>The grade, retaining condition, cladding build-out, exact flashing geometry, and product selections remain coordination assumptions. Every construction quantity and detail must be field-verified before ordering or installation.</p>
          </div>
          <div className="intro__contact">
            <a href="tel:+19028099412"><Phone size={16} /> (902) 809-9412</a>
            <a href="mailto:info@bhcontracting.ca"><Mail size={16} /> info@bhcontracting.ca</a>
            <a href="https://bhcontracting.ca" target="_blank" rel="noreferrer"><ExternalLink size={16} /> bhcontracting.ca</a>
          </div>
        </section>

        <section id="designs" className="section section-paper designs-section">
          <div className="section-heading" data-reveal>
            <div className="section-index"><span>01</span><b>FAÇADE OPTIONS</b></div>
            <div><span className="eyebrow">CLIENT DECISION / FOUR SYSTEMS</span><h2>Compare the siding, cladding & fascia strategies.</h2></div>
            <p>Every board uses the same official elevation pixels. Only siding orientation, material boundaries, portal composition, transition flashing, and fascia treatment change.</p>
          </div>
          <div data-reveal><ConceptGallery /></div>
        </section>

        <section className="material-interlude">
          <figure data-reveal>
            <img src={assets.charcoalTexture} alt="Macro sample of charcoal vertical metal siding" />
            <figcaption><span>FIELD MATERIAL</span><b>Charcoal vertical profile</b></figcaption>
          </figure>
          <div className="material-interlude__note" data-reveal>
            <span>THE CONTINUITY RULE</span>
            <p>Use one dominant vertical field across all faces. Let the feature cladding explain entrances, floor datums, and garage-bay rhythm—not cover every available wall.</p>
          </div>
          <figure data-reveal>
            <img src={assets.cedarTexture} alt="Macro sample of warm cedar-tone horizontal cladding" />
            <figcaption><span>FEATURE MATERIAL</span><b>Warm horizontal accent</b></figcaption>
          </figure>
        </section>

        <section id="model" className="section section-model">
          <div className="section-heading section-heading--light" data-reveal>
            <div className="section-index"><span>02</span><b>INTERACTIVE MODEL</b></div>
            <div><span className="eyebrow eyebrow--light">PARAMETRIC / BROWSER READY</span><h2>Inspect the shell from every grade.</h2></div>
            <p>Orbit the verified shell and corrected site model. Application-system differences are shown on the geometry-locked concept plates rather than simulated as colour swaps.</p>
          </div>
          <div data-reveal><ModelStudio /></div>
        </section>

        <section className="section section-paper evidence-section">
          <div className="section-heading" data-reveal>
            <div className="section-index"><span>03</span><b>SITE EVIDENCE</b></div>
            <div><span className="eyebrow">PHOTOGRAPHS × MODEL</span><h2>Existing conditions informed the sloped-site reconstruction.</h2></div>
            <p>The corrected model keeps the continuous driveway outside a wall-side clearance strip and provides a low landing at the existing downhill-side man door. The slope no longer covers the door or lower windows; a survey remains the authority for final grade.</p>
          </div>
          <div data-reveal><SiteGallery /></div>
        </section>

        <section id="plans" className="section section-drawing">
          <div className="section-heading" data-reveal>
            <div className="section-index"><span>04</span><b>PLANS & MEASUREMENTS</b></div>
            <div><span className="eyebrow">A-EX-01 / DIMENSION REGISTER</span><h2>Written dimensions drive the model.</h2></div>
            <p>The concept elevations separate verified permit values from visual assumptions. Do not scale the presentation boards for construction.</p>
          </div>
          <div data-reveal><MeasurementBoard /></div>
        </section>

        <section id="scope" className="section section-paper scope-section">
          <div className="scope-layout">
            <div className="scope-layout__intro" data-reveal>
              <span className="eyebrow">05 / QUANTITY & PRICE BASIS</span>
              <h2>Approximately 28.0 net squares.<br />30.8 with allowance.</h2>
              <p>The provisional customer note of 30 squares is a reasonable planning figure. Final procurement still requires field dimensions, selected product coverage, transitions, laps, corners, starters, flashings, and waste.</p>
              <div className="scope-kpi">
                <span>Contract draft</span>
                <strong>$13,000</strong>
                <small>before HST · tax treatment to confirm</small>
              </div>
            </div>

            <div className="scope-layout__tables" data-reveal>
              <div className="table-block">
                <div className="table-block__title"><h3>Preliminary elevation takeoff</h3><span>m² / ft² / squares</span></div>
                <div className="data-table">
                  <div className="data-table__row data-table__head"><span>Elevation</span><span>Gross m²</span><span>Openings</span><span>Net ft²</span><span>Squares</span></div>
                  {takeoff.map((row) => (
                    <div className="data-table__row" key={row.elevation}>
                      <b>{row.elevation}</b><span>{row.gross.toFixed(1)}</span><span>{row.openings.toFixed(1)} m²</span><span>{row.feet.toLocaleString()}</span><strong>{row.squares.toFixed(1)}</strong>
                    </div>
                  ))}
                  <div className="data-table__row data-table__total"><b>Total net</b><span /><span /><span>2,796</span><strong>{totalSquares.toFixed(1)}</strong></div>
                </div>
              </div>

              <div className="table-block table-block--price">
                <div className="table-block__title"><h3>Provisional pricing</h3><span>Before HST</span></div>
                {pricing.map((row) => (
                  <div className="price-row" key={row.item}>
                    <span><b>{row.item}</b><small>{row.quantity} · {row.rate}</small></span>
                    <strong>{row.total}</strong>
                  </div>
                ))}
                <div className="price-total"><span>Contract price</span><strong>$13,000</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section section-source">
          <div className="section-heading" data-reveal>
            <div className="section-index"><span>06</span><b>SOURCE DRAWINGS</b></div>
            <div><span className="eyebrow">ISSUED PERMIT SET</span><h2>Review the authoritative drawing package.</h2></div>
            <p>The permit PDF remains the primary geometric source. Key sheets are rendered below for reliable browser review; the complete issued set remains available as a direct download.</p>
          </div>
          <div className="permit-board" data-reveal>
            <div className="permit-board__meta">
              <span>ISSUED SOURCE / SELECTED SHEETS</span>
              <a className="button button--dark" href={assets.permit} target="_blank" rel="noreferrer">Open complete PDF <ExternalLink size={16} /></a>
            </div>
            <div className="permit-board__grid">
              {assets.permitSheets.map((sheet, index) => (
                <a href={sheet.src} target="_blank" rel="noreferrer" key={sheet.src}>
                  <img src={sheet.src} alt={sheet.label} />
                  <span><b>0{index + 1}</b>{sheet.label}<ExternalLink size={14} /></span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-paper references-section">
          <div className="section-heading" data-reveal>
            <div className="section-index"><span>07</span><b>REFERENCE INTENT</b></div>
            <div><span className="eyebrow">CLIENT-SUPPLIED VISUALS</span><h2>The starting point: charcoal, warm grain, black trim.</h2></div>
            <p>These boards established the original material language. The four alternatives vary the actual cladding application system, transition geometry, opening frames, and fascia expression—not only colour.</p>
          </div>
          <div className="reference-pair" data-reveal>
            <figure><img src={assets.referenceSpecification} alt="Original modern warehouse siding and façade specification" /><figcaption>REFERENCE A / original façade specification</figcaption></figure>
            <figure><img src={assets.clientReference} alt="Client-supplied exterior inspiration board" /><figcaption>REFERENCE B / client exterior inspiration</figcaption></figure>
          </div>
        </section>

        <section id="contract" className="section section-contract">
          <div className="section-heading section-heading--light" data-reveal>
            <div className="section-index"><span>08</span><b>CONTRACT REVIEW</b></div>
            <div><span className="eyebrow eyebrow--light">WORKING DRAFT / EDITABLE DOCX</span><h2>Scope clarity before mobilization.</h2></div>
            <p>The full working structure is presented here for review. Complete all blanks, assign every responsibility, and obtain legal review before signature.</p>
          </div>
          <div data-reveal><ContractReview /></div>
        </section>

        <section id="files" className="section section-paper files-section">
          <div className="section-heading" data-reveal>
            <div className="section-index"><span>09</span><b>PROJECT LIBRARY</b></div>
            <div><span className="eyebrow">COMPLETE HANDOFF</span><h2>Every editable source and issued output.</h2></div>
            <p>Download the contract forms, permit drawings, DXF/SVG elevations, takeoff workbook, parametric model source, and common 3D exchange formats.</p>
          </div>
          <div data-reveal><DownloadLibrary /></div>
        </section>

        <section className="closing">
          <div className="closing__copy" data-reveal>
            <span className="eyebrow eyebrow--light">NEXT DECISION</span>
            <h2>Select one façade direction, confirm the supply matrix, then field-measure.</h2>
          </div>
          <div className="closing__steps" data-reveal>
            <span><b>01</b>Approve material direction</span>
            <span><b>02</b>Confirm who supplies each component</span>
            <span><b>03</b>Verify grade, openings, and cladding limits</span>
            <span><b>04</b>Issue final pricing and contract</span>
          </div>
          <a className="button button--cedar" href="mailto:info@bhcontracting.ca?subject=Walid%20Warehouse%20Facade%20Review">Send selections to BH <ArrowRight size={17} /></a>
        </section>
      </main>

      <footer>
        <div className="brand brand--footer"><img src={assets.logo} alt="" /><span><b>BH CONTRACTING LTD.</b><small>Building envelopes · exterior systems · Nova Scotia</small></span></div>
        <div className="footer__contact">
          <a href="tel:+19028099412"><Phone size={15} /> (902) 809-9412</a>
          <a href="mailto:info@bhcontracting.ca"><Mail size={15} /> info@bhcontracting.ca</a>
          <span><MapPin size={15} /> Project: 9 Alicia Scott Ave.</span>
        </div>
        <div className="footer__notice"><ShieldCheck size={16} /> Concept/modeling presentation. Field verification and professional review required.</div>
      </footer>
    </div>
  )
}
