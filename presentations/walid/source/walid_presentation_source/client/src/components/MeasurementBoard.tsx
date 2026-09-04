/** Architect's Sample Room: drawing-board facts with verified-versus-assumed status. */
import { AlertTriangle, CheckCircle2, Download } from "lucide-react"
import { assets, dimensions, takeoff } from "@/data/project"

export default function MeasurementBoard() {
  const total = takeoff.reduce((sum, row) => sum + row.squares, 0)

  return (
    <div className="measurement-board">
      <div className="measurement-board__drawing">
        <img src={assets.elevations} alt="Dimensioned concept elevations for the verified warehouse faces" />
        <div className="measurement-board__actions">
          <a href={assets.elevations} target="_blank" rel="noreferrer"><Download size={16} /> Open full-resolution sheet</a>
        </div>
      </div>

      <div className="measurement-board__register">
        <span className="eyebrow">DIMENSION REGISTER</span>
        <h3>Written values first.<br />Assumptions marked.</h3>
        <div className="dimension-list">
          {dimensions.map((item) => (
            <div key={item.label}>
              <span className={item.verified ? "status verified" : "status assumed"}>
                {item.verified ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              </span>
              <div><b>{item.label}</b><small>{item.note}</small></div>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className="takeoff-total">
          <span>Preliminary exposed siding</span>
          <strong>{total.toFixed(1)} <small>squares net</small></strong>
          <p>Approximately 30.8 squares with a 10% coverage/waste allowance. Field measurement and product-specific coverage remain required.</p>
        </div>
      </div>
    </div>
  )
}
