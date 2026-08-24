"use client";

import { useEffect, useRef, useState } from "react";

export function SignaturePad({
  onChange,
  width = 420,
  height = 160,
}: {
  onChange: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
    };
  }

  function emit() {
    const canvas = canvasRef.current;
    if (!canvas || empty) {
      onChange(null);
      return;
    }
    onChange(canvas.toDataURL("image/png"));
  }

  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="signature-canvas"
        aria-label="Signature canvas"
        onPointerDown={(e) => {
          drawing.current = true;
          const ctx = canvasRef.current?.getContext("2d");
          if (!ctx) return;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvasRef.current?.getContext("2d");
          if (!ctx) return;
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          setEmpty(false);
        }}
        onPointerUp={() => {
          drawing.current = false;
          emit();
        }}
      />
      <button
        type="button"
        className="mainframe-panel-btn-muted"
        onClick={() => {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (!canvas || !ctx) return;
          ctx.fillStyle = "#0a0a0a";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          setEmpty(true);
          onChange(null);
        }}
      >
        Clear signature
      </button>
    </div>
  );
}
