/** Architect's Sample Room: proposal-sheet fallback state for every unknown route. */
import { ArrowUpRight, Home, Ruler } from "lucide-react"
import { useLocation } from "wouter"
import { assets } from "@/data/project"

export default function NotFound() {
  const [, setLocation] = useLocation()

  return (
    <main className="proposal-fallback">
      <div className="proposal-fallback__sheet">
        <header className="proposal-fallback__header">
          <div className="proposal-fallback__brand">
            <img src={assets.logo} alt="BH Contracting" />
            <span>BH CONTRACTING LTD.</span>
          </div>
          <span className="proposal-fallback__index">A-404 / ROUTE INDEX</span>
        </header>
        <div className="proposal-fallback__rule" />
        <div className="proposal-fallback__body">
          <div className="proposal-fallback__eyebrow">DRAWING COORDINATE / NOT ISSUED</div>
          <div className="proposal-fallback__number">404</div>
          <h1>Sheet not found.</h1>
          <p>The requested presentation coordinate is not in the current Walid warehouse set. Return to the proposal cover or use the primary presentation route.</p>
          <div className="proposal-fallback__actions">
            <button onClick={() => setLocation("/")}><Home size={16} /> Return to cover</button>
            <button className="proposal-fallback__secondary" onClick={() => window.history.back()}><ArrowUpRight size={16} /> Previous sheet</button>
          </div>
        </div>
        <footer className="proposal-fallback__footer">
          <span><Ruler size={14} /> WALID / EXT-00</span>
          <span>PRIVATE CLIENT PRESENTATION / BH CONTRACTING</span>
        </footer>
      </div>
    </main>
  )
}
