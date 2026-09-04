/** Architect's Sample Room: readable legal review, not a hidden download wall. */
import { AlertTriangle, Download, FileCheck2 } from "lucide-react"
import { adminConfirmations, contractSections, downloads, scopeMatrix } from "@/data/project"

export default function ContractReview() {
  const mainContract = downloads.find((item) => item.label === "Main siding contract draft")!

  return (
    <div className="contract-review">
      <aside className="contract-review__summary">
        <span className="eyebrow eyebrow--light">CONTRACT 03 / WORKING DRAFT</span>
        <h3>$13,000<br /><small>before HST</small></h3>
        <p>30 siding squares at $400 plus two door installations at $500 each.</p>
        <dl>
          <div><dt>Statutory holdback basis</dt><dd>10% / $1,300</dd></div>
          <div><dt>Non-holdback payment</dt><dd>7 calendar days</dd></div>
          <div><dt>Workmanship warranty</dt><dd>1 year</dd></div>
          <div><dt>Draft jurisdiction</dt><dd>Nova Scotia</dd></div>
        </dl>
        <a className="button button--cedar" href={mainContract.href} download><Download size={17} /> Download editable contract</a>
        <div className="legal-note"><AlertTriangle size={18} /><p>This is a working draft, not formal legal advice. A qualified Nova Scotia lawyer should review it before signature.</p></div>
      </aside>

      <div className="contract-review__document">
        <header>
          <span>Draft Construction Subcontract / Trade Agreement</span>
          <h3>Exterior siding, façade accents & door installation</h3>
          <p>BH Contracting Ltd. × SOI Trade Inc. · 9 Alicia Scott Ave., Mount Uniacke, Nova Scotia</p>
        </header>

        <div className="contract-review__clauses">
          {contractSections.map((section, index) => (
            <details key={section.title} open={index < 4}>
              <summary><span>{String(index + 1).padStart(2, "0")}</span>{section.title}</summary>
              <p>{section.body}</p>
            </details>
          ))}
        </div>

        <section className="contract-checklist">
          <div>
            <FileCheck2 size={20} />
            <h4>Schedule A · Responsibility matrix</h4>
            <p>Every unresolved supply and installation item must be assigned before signing.</p>
          </div>
          <div className="checklist-columns">
            {scopeMatrix.map((item) => <span key={item}>□ {item}</span>)}
          </div>
        </section>

        <section className="contract-checklist contract-checklist--warm">
          <div>
            <AlertTriangle size={20} />
            <h4>Schedule B · Complete before issue</h4>
          </div>
          <div className="checklist-columns checklist-columns--two">
            {adminConfirmations.map((item) => <span key={item}>□ {item}</span>)}
          </div>
        </section>
      </div>
    </div>
  )
}
