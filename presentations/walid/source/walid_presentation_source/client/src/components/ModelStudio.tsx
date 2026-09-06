/**
 * Architect's Sample Room: corrected static material model with technical camera presets.
 * Application alternatives remain on the geometry-locked elevation plates, not palette swaps.
 */
import "@google/model-viewer"
import React from "react"
import { useRef } from "react"
import { Maximize2, Rotate3D } from "lucide-react"
import { assets } from "@/data/project"

export default function ModelStudio() {
  const viewerRef = useRef<any>(null)

  const setCamera = (orbit: string) => {
    if (!viewerRef.current) return
    viewerRef.current.cameraOrbit = orbit
    viewerRef.current.fieldOfView = "31deg"
    viewerRef.current.jumpCameraToGoal?.()
  }

  return (
    <div className="model-studio">
      <div className="model-studio__toolbar">
        <div>
          <span className="eyebrow eyebrow--light">MODEL 01 / CLEARANCE-CORRECTED SITE</span>
          <h3>Orbit the locked building shell.</h3>
          <p className="model-studio__spec">Building dimensions and openings unchanged · continuous drive offset from wall · low landing at downhill man door</p>
        </div>
        <div className="model-studio__camera" aria-label="Camera presets">
          <button onClick={() => setCamera("28deg 73deg 31m")}>Entrance</button>
          <button onClick={() => setCamera("-152deg 76deg 32m")}>Garage</button>
          <button onClick={() => setCamera("-87deg 68deg 35m")}>Drive side</button>
          <button onClick={() => setCamera("32deg 54deg 38m")}><Maximize2 size={15} /> Overall</button>
        </div>
      </div>

      <div className="model-studio__stage">
        {React.createElement("model-viewer" as any, {
          ref: viewerRef,
          src: assets.model,
          poster: assets.hero,
          alt: "Interactive model of the verified Walid warehouse with a driveway ramp offset from the downhill sidewall openings",
          "camera-controls": true,
          "touch-action": "pan-y",
          "shadow-intensity": "1",
          "shadow-softness": "0.8",
          exposure: "1.08",
          "environment-image": "neutral",
          "camera-orbit": "32deg 54deg 38m",
          "min-camera-orbit": "auto 24deg 24m",
          "max-camera-orbit": "auto 86deg 58m",
          "interaction-prompt": "auto",
          loading: "eager",
        })}
        <div className="model-studio__hint"><Rotate3D size={16} /> Drag to orbit · scroll to zoom</div>
      </div>

      <div className="model-studio__disclaimer">
        <strong>Geometry lock.</strong> The 15.42 m × 12.38 m envelope, 9.12 m slab-to-ridge stack, roof form, and every modeled opening remain unchanged. The four façade systems are compared on the official concept plates above.
      </div>
    </div>
  )
}
