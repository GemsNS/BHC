/** Architect's Sample Room: typed custom element for the interactive technical model. */
import type React from "react"

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        poster?: string
        alt?: string
        "camera-controls"?: boolean
        "touch-action"?: string
        "shadow-intensity"?: string
        "shadow-softness"?: string
        exposure?: string
        "environment-image"?: string
        "camera-orbit"?: string
        "min-camera-orbit"?: string
        "max-camera-orbit"?: string
        "interaction-prompt"?: string
        loading?: "auto" | "lazy" | "eager"
      }
    }
  }
}

export {}
