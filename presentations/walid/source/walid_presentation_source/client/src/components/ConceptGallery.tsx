/** Architect's Sample Room: one large comparison plate with physical material chips. */
import { useState } from "react"
import { ArrowLeft, ArrowRight, Check, Layers3 } from "lucide-react"
import { concepts } from "@/data/project"

export default function ConceptGallery() {
  const [activeIndex, setActiveIndex] = useState(0)
  const active = concepts[activeIndex]

  const move = (direction: number) => {
    setActiveIndex((activeIndex + direction + concepts.length) % concepts.length)
  }

  return (
    <div className="concept-viewer">
      <div className="concept-viewer__rail" role="tablist" aria-label="Façade design options">
        {concepts.map((concept, index) => (
          <button
            key={concept.id}
            role="tab"
            aria-selected={index === activeIndex}
            className={index === activeIndex ? "is-active" : ""}
            onClick={() => setActiveIndex(index)}
          >
            <span>{concept.number}</span>
            <b>{concept.name}</b>
            <small>{concept.relativeCost}</small>
          </button>
        ))}
      </div>

      <div className="concept-viewer__plate">
        <div className="concept-viewer__image-wrap">
          <img src={active.image} alt={`${active.name} siding, cladding, and fascia concept board`} />
          <span className="sheet-tag">FAÇADE / {active.number}</span>
        </div>

        <aside className="concept-viewer__notes">
          <div className="concept-viewer__title">
            <span>CONCEPT {active.number}</span>
            <h3>{active.name}</h3>
            <p>{active.strapline}</p>
          </div>

          <div className="material-chip-row" aria-label={`${active.name} colour system`}>
            <span style={{ backgroundColor: active.field }} title="Primary field" />
            <span style={{ backgroundColor: active.accent }} title="Feature cladding" />
            <span style={{ backgroundColor: active.fascia }} title="Fascia" />
            <span style={{ backgroundColor: active.secondary }} title="Secondary surface" />
          </div>

          <div className="concept-viewer__logic">
            <Layers3 size={18} />
            <p>{active.logic}</p>
          </div>

          <div className="concept-viewer__best">
            <Check size={18} />
            <div><b>Best for</b><p>{active.bestFor}</p></div>
          </div>

          <dl>
            <div><dt>Relative cost</dt><dd>{active.relativeCost}</dd></div>
            <div><dt>Delivery note</dt><dd>{active.maintenance}</dd></div>
          </dl>

          <div className="concept-viewer__arrows">
            <button onClick={() => move(-1)} aria-label="Previous concept"><ArrowLeft /></button>
            <span>{activeIndex + 1} / {concepts.length}</span>
            <button onClick={() => move(1)} aria-label="Next concept"><ArrowRight /></button>
          </div>
        </aside>
      </div>
    </div>
  )
}
